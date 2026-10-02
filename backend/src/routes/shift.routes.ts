import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { cashHandler, closeHandler, currentHandler, getHandler, listHandler, openHandler } from "../controllers/shift.controller";
import { requirePermission } from "../middleware/requireRole";

const router = Router();

router.use(requireAuth, businessRateLimit);
// Listing/viewing filters to one's own shifts unless the role has shifts.viewAll.
router.get("/", listHandler);
router.get("/current", requirePermission("shifts.use"), currentHandler);
router.post("/open", requirePermission("shifts.use"), openHandler);
router.post("/cash", requirePermission("shifts.use"), cashHandler);
router.get("/:id", getHandler);
router.post("/:id/close", closeHandler);

export default router;
