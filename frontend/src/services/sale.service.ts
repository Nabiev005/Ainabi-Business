import { api } from "./api";
import type { Paginated, PaymentMethod, SaleListItem, SerialLookupResult } from "../types";

export interface SaleItemPayload {
  productId: string;
  quantity: number;
  serialNumbers?: string[];
}

export interface CreateSalePayload {
  items: SaleItemPayload[];
  discount: number;
  paymentMethod: PaymentMethod;
  customerId?: string | null;
}

export interface SaleResult {
  id: string;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  customer: { id: string; name: string } | null;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    total: number;
    serialNumbers: string[];
    warrantyUntil: string | null;
  }[];
  createdAt: string;
}

export async function createSale(payload: CreateSalePayload): Promise<SaleResult> {
  const { data } = await api.post<SaleResult>("/sales", payload);
  return data;
}

export async function listSales(params: { page?: number; pageSize?: number; from?: string; to?: string }): Promise<Paginated<SaleListItem>> {
  const { data } = await api.get<Paginated<SaleListItem>>("/sales", { params });
  return data;
}

export async function findBySerial(serial: string): Promise<SerialLookupResult[]> {
  const { data } = await api.get<SerialLookupResult[]>(`/sales/serial/${encodeURIComponent(serial)}`);
  return data;
}
