import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { analyticsHandler } from "../controllers/analytics.controller";

const router = Router();

router.use(requireAuth, businessRateLimit, requirePermission("analytics.view"));
router.get("/", analyticsHandler);

export default router;
