import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { cashHandler, closeHandler, currentHandler, getHandler, listHandler, openHandler } from "../controllers/shift.controller";

const router = Router();

router.use(requireAuth, businessRateLimit);
router.get("/", listHandler);
router.get("/current", currentHandler);
router.post("/open", openHandler);
router.post("/cash", cashHandler);
router.get("/:id", getHandler);
router.post("/:id/close", closeHandler);

export default router;
