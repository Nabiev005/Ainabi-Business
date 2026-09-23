import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  createReceiptSchema,
  createStockMovementSchema,
  expiringQuerySchema,
  inventoryCountSchema,
  listDocumentsQuerySchema,
  stockQuerySchema,
  transferSchema,
  writeOffBatchSchema,
} from "../validators/stock.validator";
import * as stockService from "../services/stock.service";

export const listHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = stockQuerySchema.parse(req.query);
  const result = await stockService.listMovements(req.auth!.businessId, query);
  res.json(result);
});

export const summaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const summary = await stockService.stockSummary(req.auth!.businessId);
  res.json(summary);
});

export const reorderSuggestionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const suggestions = await stockService.getReorderSuggestions(req.auth!.businessId);
  res.json(suggestions);
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createStockMovementSchema.parse(req.body);
  const movement = await stockService.createMovement(req.auth!.businessId, req.auth!.employeeId, input);
  res.status(201).json(movement);
});

// ---------- receipts ----------
export const createReceiptHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createReceiptSchema.parse(req.body);
  res.status(201).json(await stockService.createReceipt(req.auth!.businessId, req.auth!.employeeId, input));
});

export const listReceiptsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listDocumentsQuerySchema.parse(req.query);
  res.json(await stockService.listReceipts(req.auth!.businessId, query));
});

export const getReceiptHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await stockService.getReceipt(req.auth!.businessId, req.params.id));
});

// ---------- inventory ----------
export const createInventoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = inventoryCountSchema.parse(req.body);
  res.status(201).json(await stockService.createInventoryCount(req.auth!.businessId, req.auth!.employeeId, input));
});

export const listInventoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listDocumentsQuerySchema.parse(req.query);
  res.json(await stockService.listInventoryCounts(req.auth!.businessId, query));
});

export const getInventoryHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await stockService.getInventoryCount(req.auth!.businessId, req.params.id));
});

// ---------- transfers ----------
export const createTransferHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = transferSchema.parse(req.body);
  res.status(201).json(await stockService.createTransfer(req.auth!.businessId, req.auth!.employeeId, input));
});

// ---------- batches ----------
export const expiringBatchesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { days } = expiringQuerySchema.parse(req.query);
  res.json(await stockService.listExpiringBatches(req.auth!.businessId, days));
});

export const writeOffBatchHandler = asyncHandler(async (req: Request, res: Response) => {
  const { locationId } = writeOffBatchSchema.parse(req.body ?? {});
  res.json(await stockService.writeOffBatch(req.auth!.businessId, req.auth!.employeeId, req.params.id, locationId));
});
