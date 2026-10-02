import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import {
  addPaymentHandler,
  createDebtHandler,
  createHandler,
  deleteHandler,
  getHandler,
  listHandler,
  summaryHandler,
  updateHandler,
} from "../controllers/supplier.controller";

const router = Router();

router.use(requireAuth, businessRateLimit);
router.get("/", requirePermission("suppliers.view"), listHandler);
router.get("/summary", requirePermission("suppliers.view"), summaryHandler);
router.get("/:id", requirePermission("suppliers.view"), getHandler);
router.post("/", requirePermission("suppliers.manage"), createHandler);
router.put("/:id", requirePermission("suppliers.manage"), updateHandler);
router.delete("/:id", requirePermission("suppliers.delete"), deleteHandler);
router.post("/:id/debts", requirePermission("suppliers.finance"), createDebtHandler);
router.post("/debts/:debtId/payments", requirePermission("suppliers.finance"), addPaymentHandler);

export default router;
