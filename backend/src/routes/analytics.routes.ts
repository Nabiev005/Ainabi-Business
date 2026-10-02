import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { requireFeature } from "../middleware/subscription";
import { analyticsHandler } from "../controllers/analytics.controller";

const router = Router();

router.use(requireAuth, businessRateLimit, requireFeature("analytics"), requirePermission("analytics.view"));
router.get("/", analyticsHandler);

export default router;
