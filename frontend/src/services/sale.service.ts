import { api } from "./api";
import type { Paginated, PaymentMethod, SaleDetail, SaleListItem, SerialLookupResult } from "../types";

export interface SaleItemPayload {
  productId: string;
  /** In package units when packageId is set. */
  quantity: number;
  serialNumbers?: string[];
  packageId?: string | null;
}

export interface CreateSalePayload {
  items: SaleItemPayload[];
  discount: number;
  paymentMethod: PaymentMethod;
  customerId?: string | null;
  locationId?: string | null;
  priceLevel?: "RETAIL" | "WHOLESALE";
  prescriptionConfirmed?: boolean;
}

export interface SaleListQuery {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  search?: string;
  paymentMethod?: PaymentMethod;
  locationId?: string;
}

export interface ReturnPayload {
  items: { saleItemId: string; quantity: number; serialNumbers?: string[] }[];
  refundMethod: PaymentMethod;
  reason?: string | null;
}

export async function createSale(payload: CreateSalePayload): Promise<SaleDetail> {
  const { data } = await api.post<SaleDetail>("/sales", payload);
  return data;
}

export async function listSales(params: SaleListQuery): Promise<Paginated<SaleListItem>> {
  const { data } = await api.get<Paginated<SaleListItem>>("/sales", { params });
  return data;
}

export async function getSale(id: string): Promise<SaleDetail> {
  const { data } = await api.get<SaleDetail>(`/sales/${id}`);
  return data;
}

export async function createReturn(saleId: string, payload: ReturnPayload): Promise<{ id: string; total: number; sale: SaleDetail }> {
  const { data } = await api.post(`/sales/${saleId}/returns`, payload);
  return data;
}

export async function findBySerial(serial: string): Promise<SerialLookupResult[]> {
  const { data } = await api.get<SerialLookupResult[]>(`/sales/serial/${encodeURIComponent(serial)}`);
  return data;
}
