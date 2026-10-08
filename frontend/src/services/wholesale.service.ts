import { api } from "./api";

export type WholesaleStatus = "NEW" | "ACCEPTED" | "SHIPPED" | "RECEIVED" | "REJECTED" | "CANCELLED";

export interface WholesaleSupplier {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  note: string | null;
  productsCount: number;
}

export interface WholesaleProduct {
  id: string;
  name: string;
  barcode: string | null;
  unit: string;
  category: string | null;
  price: number;
  imageUrl: string | null;
}

interface Party {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
}

export interface WholesaleOrder {
  id: string;
  side: "BUYER" | "SELLER";
  status: WholesaleStatus;
  total: number;
  comment: string | null;
  sellerNote: string | null;
  createdByName: string;
  saleId: string | null;
  receiptId: string | null;
  createdAt: string;
  updatedAt: string;
  buyer: Party;
  seller: Party;
  items: { id: string; productId: string; name: string; barcode: string | null; unit: string; price: number; quantity: number }[];
}

export async function getSettings(): Promise<{ wholesaleEnabled: boolean; wholesaleNote: string | null }> {
  const { data } = await api.get("/wholesale/settings");
  return data;
}

export async function updateSettings(payload: { enabled: boolean; note: string }): Promise<{ wholesaleEnabled: boolean; wholesaleNote: string | null }> {
  const { data } = await api.put("/wholesale/settings", payload);
  return data;
}

export async function listSuppliers(search?: string): Promise<WholesaleSupplier[]> {
  const { data } = await api.get<WholesaleSupplier[]>("/wholesale/suppliers", { params: { search } });
  return data;
}

export async function listSupplierProducts(
  sellerId: string,
  params: { search?: string; page?: number },
): Promise<{ seller: Omit<WholesaleSupplier, "productsCount">; items: WholesaleProduct[]; page: number; totalPages: number }> {
  const { data } = await api.get(`/wholesale/suppliers/${sellerId}/products`, { params });
  return data;
}

export async function createOrder(payload: { sellerBusinessId: string; items: { productId: string; quantity: number }[]; comment?: string }): Promise<WholesaleOrder> {
  const { data } = await api.post<WholesaleOrder>("/wholesale/orders", payload);
  return data;
}

export async function listOrders(side: "BUYER" | "SELLER"): Promise<WholesaleOrder[]> {
  const { data } = await api.get<WholesaleOrder[]>("/wholesale/orders", { params: { side } });
  return data;
}

export async function changeStatus(
  id: string,
  payload: { status: WholesaleStatus; note?: string; recordSale?: boolean; paymentMethod?: "CASH" | "CARD" | "QR"; createReceipt?: boolean },
): Promise<{ order: WholesaleOrder; unmatched: { name: string; barcode: string | null; quantity: number }[] }> {
  const { data } = await api.post(`/wholesale/orders/${id}/status`, payload);
  return data;
}
