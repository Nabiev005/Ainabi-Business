import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requireRole } from "../middleware/requireRole";
import {
  createHandler,
  createInventoryHandler,
  createReceiptHandler,
  createTransferHandler,
  expiringBatchesHandler,
  getInventoryHandler,
  getReceiptHandler,
  listHandler,
  listInventoryHandler,
  listReceiptsHandler,
  reorderSuggestionsHandler,
  summaryHandler,
  writeOffBatchHandler,
} from "../controllers/stock.controller";

const router = Router();
const manager = requireRole("OWNER", "ADMIN");

router.use(requireAuth, businessRateLimit);
router.get("/", listHandler);
router.get("/summary", summaryHandler);
router.get("/reorder-suggestions", reorderSuggestionsHandler);
router.post("/", manager, createHandler);

router.get("/receipts", listReceiptsHandler);
router.get("/receipts/:id", getReceiptHandler);
router.post("/receipts", manager, createReceiptHandler);

router.get("/inventory", listInventoryHandler);
router.get("/inventory/:id", getInventoryHandler);
router.post("/inventory", manager, createInventoryHandler);

router.post("/transfers", manager, createTransferHandler);

router.get("/batches/expiring", expiringBatchesHandler);
router.post("/batches/:id/write-off", manager, writeOffBatchHandler);

export default router;
