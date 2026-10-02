import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { createHandler, getHandler, listHandler, statusHandler, updateHandler } from "../controllers/repair.controller";
import { requirePermission } from "../middleware/requireRole";
import { requireFeature } from "../middleware/subscription";

const router = Router();

router.use(requireAuth, businessRateLimit, requireFeature("repairs"), requirePermission("repairs.manage"));
router.get("/", listHandler);
router.get("/:id", getHandler);
router.post("/", createHandler);
router.put("/:id", updateHandler);
router.post("/:id/status", statusHandler);

export default router;
