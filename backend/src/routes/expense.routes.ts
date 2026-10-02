import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { createHandler, deleteHandler, listHandler } from "../controllers/expense.controller";

const router = Router();

router.use(requireAuth, businessRateLimit);
router.get("/", requirePermission("expenses.view"), listHandler);
router.post("/", requirePermission("expenses.manage"), createHandler);
router.delete("/:id", requirePermission("expenses.manage"), deleteHandler);

export default router;
