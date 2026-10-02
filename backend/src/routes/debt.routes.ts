import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { addPaymentHandler, createHandler, listHandler, summaryHandler } from "../controllers/debt.controller";
import { requirePermission } from "../middleware/requireRole";

const router = Router();

router.use(requireAuth, businessRateLimit);
router.get("/", requirePermission("debts.view"), listHandler);
router.get("/summary", requirePermission("debts.view"), summaryHandler);
router.post("/", requirePermission("debts.create"), createHandler);
router.post("/:id/payments", requirePermission("debts.collect"), addPaymentHandler);

export default router;
