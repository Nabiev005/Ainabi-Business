import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { createHandler, deleteHandler, listHandler, updateHandler } from "../controllers/category.controller";

const router = Router();

router.use(requireAuth, businessRateLimit);
router.get("/", requirePermission("products.view"), listHandler);
router.post("/", requirePermission("products.manage"), createHandler);
router.put("/:id", requirePermission("products.manage"), updateHandler);
router.delete("/:id", requirePermission("products.manage"), deleteHandler);

export default router;
