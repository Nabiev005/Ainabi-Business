import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { asyncHandler } from "../utils/asyncHandler";
import * as billingService from "../services/billing.service";

const router = Router();

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
