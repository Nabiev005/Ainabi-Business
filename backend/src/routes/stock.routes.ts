import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { requireFeature } from "../middleware/subscription";
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

router.use(requireAuth, businessRateLimit);
router.get("/", requirePermission("stock.view"), listHandler);
router.get("/summary", requirePermission("stock.view"), summaryHandler);
router.get("/reorder-suggestions", requirePermission("stock.view"), reorderSuggestionsHandler);
router.post("/", requirePermission("stock.adjust"), createHandler);

router.get("/receipts", requirePermission("stock.view"), listReceiptsHandler);
router.get("/receipts/:id", requirePermission("stock.view"), getReceiptHandler);
router.post("/receipts", requireFeature("receiving"), requirePermission("stock.receive"), createReceiptHandler);

router.get("/inventory", requirePermission("stock.view"), listInventoryHandler);
router.get("/inventory/:id", requirePermission("stock.view"), getInventoryHandler);
router.post("/inventory", requireFeature("inventory"), requirePermission("stock.inventory"), createInventoryHandler);

router.post("/transfers", requirePermission("stock.adjust"), createTransferHandler);

router.get("/batches/expiring", requirePermission("stock.view"), expiringBatchesHandler);
router.post("/batches/:id/write-off", requirePermission("stock.adjust"), writeOffBatchHandler);

export default router;
