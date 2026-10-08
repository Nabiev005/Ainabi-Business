import * as riskService from "../services/risk.service";
import { reportQuerySchema } from "../validators/report.validator";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { requireFeature } from "../middleware/subscription";
import { asyncHandler } from "../utils/asyncHandler";
import { hasPermission } from "../config/permissions";
import * as insightsService from "../services/insights.service";

const router = Router();
router.use(requireAuth, businessRateLimit);

// Monthly report + advice (owner / manager, PRO and up). The slow-stock
// hint (cash tied up) is only included for roles allowed to see slow stock.
router.get(
  "/monthly",
  requireFeature("analytics"),
  requirePermission("analytics.view"),
  asyncHandler(async (req, res) => {
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(req.query);
    res.json(await insightsService.buildMonthlyInsights(req.auth!.businessId, { month, includeStale: hasPermission(req.auth!.role, "stock.stale") }));
  }),
);

// Till watch: who to look at and why (discounts, below-cost sales, cash shortages...).
router.get(
  "/risk",
  requireFeature("analytics"),
  requirePermission("analytics.view"),
  asyncHandler(async (req, res) => {
    res.json(await riskService.buildRiskReport(req.auth!.businessId, reportQuerySchema.parse(req.query)));
  }),
);
// Returns journal — owner, accountant, registrar.
router.get(
  "/returns",
  requirePermission("returns.view"),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(30),
      })
      .parse(req.query);
    res.json(await insightsService.listReturns(req.auth!.businessId, query));
  }),
);

// Slow stock — owner and seller. The seller gets what to push, never the cost.
router.get(
  "/stale",
  requirePermission("stock.stale"),
  asyncHandler(async (req, res) => {
    const { days } = z.object({ days: z.coerce.number().int().min(14).max(365).default(60) }).parse(req.query);
    const rows = await insightsService.getStaleProducts(req.auth!.businessId, days);
    if (hasPermission(req.auth!.role, "costs.view")) {
      res.json({ days, frozenValue: rows.reduce((a, r) => a + r.frozenValue, 0), items: rows });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    res.json({ days, frozenValue: null, items: rows.map(({ purchasePrice, frozenValue, ...rest }) => rest) });
  }),
);

export default router;
