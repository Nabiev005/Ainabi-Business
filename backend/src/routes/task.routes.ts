import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { requireFeature } from "../middleware/subscription";
import {
  assigneesHandler,
  createHandler,
  deleteHandler,
  listHandler,
  markSeenHandler,
  notificationsHandler,
  statusHandler,
  updateHandler,
} from "../controllers/task.controller";

const router = Router();

router.use(requireAuth, businessRateLimit, requireFeature("tasks"));
// Every employee: their own tasks (the service checks scope=all against tasks.manage).
router.get("/", listHandler);
router.get("/notifications", notificationsHandler);
router.post("/notifications/seen", markSeenHandler);
router.post("/:id/status", statusHandler);
// Assigning and editing work — owner / manager.
router.get("/assignees", requirePermission("tasks.manage"), assigneesHandler);
router.post("/", requirePermission("tasks.manage"), createHandler);
router.put("/:id", requirePermission("tasks.manage"), updateHandler);
router.delete("/:id", requirePermission("tasks.manage"), deleteHandler);

export default router;
