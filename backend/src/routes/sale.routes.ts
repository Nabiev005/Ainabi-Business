import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { bySerialHandler, createHandler, createReturnHandler, getHandler, listHandler } from "../controllers/sale.controller";

const router = Router();

router.use(requireAuth, businessRateLimit);
router.get("/", requirePermission("sales.view"), listHandler);
router.get("/serial/:serial", requirePermission("sales.view"), bySerialHandler);
router.get("/:id", requirePermission("sales.view"), getHandler);
router.post("/", requirePermission("pos.sell"), createHandler);
// Refunds hand money back — manager-level only.
router.post("/:id/returns", requirePermission("sales.return"), createReturnHandler);

export default router;
