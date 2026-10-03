import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { requireFeature } from "../middleware/subscription";
import { analyticsHandler, setPlanHandler } from "../controllers/analytics.controller";

const router = Router();

router.use(requireAuth, businessRateLimit, requireFeature("analytics"), requirePermission("analytics.view"));
router.get("/", analyticsHandler);
router.put("/plan", requirePermission("settings.business"), setPlanHandler);

export default router;
