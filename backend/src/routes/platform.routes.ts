import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { PLAN_IDS, PLANS } from "../config/plans";
import * as billingService from "../services/billing.service";

/**
 * The platform owner's panel: every business on the platform and recording
 * subscription payments. Only accounts listed in PLATFORM_ADMIN_EMAILS.
 */
function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.isPlatformAdmin) throw ApiError.forbidden("Платформа админине гана уруксат.");
  next();
}

const paymentSchema = z.object({
  plan: z.enum(PLAN_IDS),
  months: z.coerce.number().int().min(0).max(36),
  // Free extra days (goodwill, a longer trial) — no payment recorded for these alone.
  days: z.coerce.number().int().min(0).max(366).default(0),
  amount: z.coerce.number().nonnegative().default(0),
  note: z.string().trim().max(300).optional().nullable(),
});

const router = Router();

router.use(requireAuth, requirePlatformAdmin);

router.get(
  "/businesses",
  asyncHandler(async (req, res) => {
    const { search } = z.object({ search: z.string().optional() }).parse(req.query);
    res.json({ plans: PLAN_IDS.map((id) => PLANS[id]), businesses: await billingService.listAllBusinesses(search) });
  }),
);

router.get(
  "/payments",
  asyncHandler(async (_req, res) => {
    res.json(await billingService.listAllPayments());
  }),
);

router.post(
  "/businesses/:id/complimentary",
  asyncHandler(async (req, res) => {
    const { complimentary } = z.object({ complimentary: z.boolean() }).parse(req.body);
    res.json(await billingService.setComplimentary(req.params.id, complimentary));
  }),
);
router.post(
  "/businesses/:id/block",
  asyncHandler(async (req, res) => {
    res.json(await billingService.blockBusiness(req.params.id));
  }),
);
router.post(
  "/businesses/:id/subscription",
  asyncHandler(async (req, res) => {
    const input = paymentSchema.parse(req.body);
    res.json(await billingService.recordPayment(req.auth!.userId, req.params.id, input));
  }),
);

export default router;
