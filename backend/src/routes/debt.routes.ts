import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import {
  addPaymentHandler,
  createHandler,
  getHandler,
  listHandler,
  remindedHandler,
  remindersHandler,
  scheduleHandler,
  summaryHandler,
} from "../controllers/debt.controller";
import { requirePermission } from "../middleware/requireRole";

const router = Router();

router.use(requireAuth, businessRateLimit);
router.get("/", requirePermission("debts.view"), listHandler);
router.get("/summary", requirePermission("debts.view"), summaryHandler);
router.get("/reminders", requirePermission("debts.view"), remindersHandler);
router.get("/:id", requirePermission("debts.view"), getHandler);
router.put("/:id/schedule", requirePermission("debts.create"), scheduleHandler);
router.post("/:id/reminded", requirePermission("debts.collect"), remindedHandler);
router.post("/", requirePermission("debts.create"), createHandler);
router.post("/:id/payments", requirePermission("debts.collect"), addPaymentHandler);

export default router;
