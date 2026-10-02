import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { createHandler, deleteHandler, getHandler, listHandler, updateHandler } from "../controllers/customer.controller";
import { requirePermission } from "../middleware/requireRole";

const router = Router();

router.use(requireAuth, businessRateLimit);
router.get("/", requirePermission("customers.view"), listHandler);
router.get("/:id", requirePermission("customers.view"), getHandler);
router.post("/", requirePermission("customers.manage"), createHandler);
router.put("/:id", requirePermission("customers.manage"), updateHandler);
router.delete("/:id", requirePermission("customers.delete"), deleteHandler);

export default router;
