import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requireRole } from "../middleware/requireRole";
import { bySerialHandler, createHandler, createReturnHandler, getHandler, listHandler } from "../controllers/sale.controller";

const router = Router();

router.use(requireAuth, businessRateLimit);
router.get("/", listHandler);
router.get("/serial/:serial", bySerialHandler);
router.get("/:id", getHandler);
router.post("/", createHandler);
// Refunds hand money back — manager-level only.
router.post("/:id/returns", requireRole("OWNER", "ADMIN"), createReturnHandler);

export default router;
