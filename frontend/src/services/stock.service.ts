import { api } from "./api";
import type {
  ExpiringBatch,
  InventoryCountDetail,
  InventoryCountListItem,
  Paginated,
  ProductUnit,
  PurchaseReceiptDetail,
  PurchaseReceiptListItem,
  StockMovement,
  StockMovementType,
} from "../types";

export interface ReorderSuggestion {
  productId: string;
  name: string;
  quantity: number;
  unit: ProductUnit;
  dailyVelocity: number;
  daysUntilStockout: number | null;
}

export interface StockSummary {
  totalProducts: number;
  totalQuantity: number;
  totalValue: number;
  lowStock: number;
  outOfStock: number;
}

export type ManualMovementType = "IN" | "OUT" | "WRITE_OFF" | "ADJUSTMENT";

export interface CreateMovementPayload {
  productId: string;
  type: ManualMovementType;
  quantity: number;
  purchasePrice?: number;
  supplierId?: string | null;
  comment?: string | null;
  locationId?: string | null;
  expiryDate?: string | null;
  batchNumber?: string | null;
}

export interface ReceiptPayload {
  type: "PURCHASE" | "TRADE_IN";
  supplierId?: string | null;
  customerId?: string | null;
  sellerName?: string | null;
  locationId?: string | null;
  docNumber?: string | null;
  comment?: string | null;
  items: {
    productId: string;
    quantity: number;
    purchasePrice: number;
    salePrice?: number | null;
    batchNumber?: string | null;
    expiryDate?: string | null;
    serialNumbers?: string[];
  }[];
  paidAmount?: number;
  paymentMethod: "CASH" | "CARD" | "QR";
  createSupplierDebt: boolean;
}

export async function getStockSummary(): Promise<StockSummary> {
  const { data } = await api.get<StockSummary>("/stock/summary");
  return data;
}

export async function listMovements(params: {
  type?: StockMovementType;
  productId?: string;
  locationId?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<StockMovement>> {
  const { data } = await api.get<Paginated<StockMovement>>("/stock", { params });
  return data;
}

export async function getReorderSuggestions(): Promise<ReorderSuggestion[]> {
  const { data } = await api.get<ReorderSuggestion[]>("/stock/reorder-suggestions");
  return data;
}

export async function createMovement(payload: CreateMovementPayload): Promise<StockMovement> {
  const { data } = await api.post<StockMovement>("/stock", payload);
  return data;
}

// ---------- receipts ----------
export async function createReceipt(payload: ReceiptPayload): Promise<PurchaseReceiptDetail> {
  const { data } = await api.post<PurchaseReceiptDetail>("/stock/receipts", payload);
  return data;
}

export async function listReceipts(params: { type?: "PURCHASE" | "TRADE_IN"; page?: number; pageSize?: number }): Promise<Paginated<PurchaseReceiptListItem>> {
  const { data } = await api.get<Paginated<PurchaseReceiptListItem>>("/stock/receipts", { params });
  return data;
}

export async function getReceipt(id: string): Promise<PurchaseReceiptDetail> {
  const { data } = await api.get<PurchaseReceiptDetail>(`/stock/receipts/${id}`);
  return data;
}

// ---------- inventory ----------
export async function createInventoryCount(payload: {
  locationId?: string | null;
  comment?: string | null;
  items: { productId: string; countedQty: number }[];
}): Promise<InventoryCountDetail> {
  const { data } = await api.post<InventoryCountDetail>("/stock/inventory", payload, { timeout: 60000 });
  return data;
}

export async function listInventoryCounts(params: { page?: number; pageSize?: number }): Promise<Paginated<InventoryCountListItem>> {
  const { data } = await api.get<Paginated<InventoryCountListItem>>("/stock/inventory", { params });
  return data;
}

export async function getInventoryCount(id: string): Promise<InventoryCountDetail> {
  const { data } = await api.get<InventoryCountDetail>(`/stock/inventory/${id}`);
  return data;
}

// ---------- transfers ----------
export async function createTransfer(payload: {
  fromLocationId: string;
  toLocationId: string;
  comment?: string | null;
  items: { productId: string; quantity: number }[];
}): Promise<{ id: string; itemsCount: number }> {
  const { data } = await api.post("/stock/transfers", payload);
  return data;
}

// ---------- batches ----------
export async function listExpiringBatches(days = 30): Promise<ExpiringBatch[]> {
  const { data } = await api.get<ExpiringBatch[]>("/stock/batches/expiring", { params: { days } });
  return data;
}

export async function writeOffBatch(batchId: string, locationId?: string | null): Promise<{ written: number }> {
  const { data } = await api.post(`/stock/batches/${batchId}/write-off`, { locationId });
  return data;
}
