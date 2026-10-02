import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import {
  boardHandler,
  createStageHandler,
  deleteStageHandler,
  historyHandler,
  listStagesHandler,
  moveHandler,
  reorderStagesHandler,
  updateStageHandler,
} from "../controllers/pipeline.controller";

const router = Router();
const configure = requirePermission("pipeline.configure");

router.use(requireAuth, businessRateLimit);
router.get("/board", requirePermission("pipeline.view"), boardHandler);
router.get("/products/:productId/history", requirePermission("pipeline.view"), historyHandler);
router.post("/move", requirePermission("pipeline.move"), moveHandler);

router.get("/stages", requirePermission("pipeline.view"), listStagesHandler);
router.post("/stages", configure, createStageHandler);
router.put("/stages/reorder", configure, reorderStagesHandler);
router.put("/stages/:id", configure, updateStageHandler);
router.delete("/stages/:id", configure, deleteStageHandler);

export default router;
