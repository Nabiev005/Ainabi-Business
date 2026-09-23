import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { createHandler, getHandler, listHandler, statusHandler, updateHandler } from "../controllers/repair.controller";

const router = Router();

router.use(requireAuth, businessRateLimit);
router.get("/", listHandler);
router.get("/:id", getHandler);
router.post("/", createHandler);
router.put("/:id", updateHandler);
router.post("/:id/status", statusHandler);

export default router;
