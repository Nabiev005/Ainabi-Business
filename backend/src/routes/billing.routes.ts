import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { asyncHandler } from "../utils/asyncHandler";
import * as billingService from "../services/billing.service";
import { PLAN_IDS, PLANS, TRIAL_DAYS, TRIAL_PLAN } from "../config/plans";

const router = Router();

// Public: the price list for the landing page (no sign-in needed).
router.get("/plans", (_req, res) => {
  res.json({ plans: PLAN_IDS.map((id) => PLANS[id]), trialDays: TRIAL_DAYS, trialPlan: TRIAL_PLAN });
});

// Subscription status and how to pay — the owner's business.
router.get(
  "/",
  requireAuth,
  businessRateLimit,
  requirePermission("settings.business"),
  asyncHandler(async (req, res) => {
    res.json(await billingService.getBilling(req.auth!.businessId));
  }),
);

export default router;
