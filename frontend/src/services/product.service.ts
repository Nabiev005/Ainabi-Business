import { api } from "./api";
import type { AttributeValue, Paginated, Product, ProductUnit } from "../types";

export interface ProductQuery {
  search?: string;
  categoryId?: string;
  status?: "ACTIVE" | "ARCHIVED";
  stock?: "low" | "out";
  page?: number;
  pageSize?: number;
}

export interface ProductPayload {
  name: string;
  categoryId?: string | null;
  sku?: string | null;
  barcode?: string | null;
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  minQuantity: number;
  unit: ProductUnit;
  imageUrl?: string | null;
  description?: string | null;
  attributes?: Record<string, AttributeValue | null>;
  requiresSerial?: boolean;
  warrantyMonths?: number | null;
}

export async function listProducts(query: ProductQuery): Promise<Paginated<Product>> {
  const { data } = await api.get<Paginated<Product>>("/products", { params: query });
  return data;
}

export async function getProduct(id: string): Promise<Product> {
  const { data } = await api.get<Product>(`/products/${id}`);
  return data;
}

export async function findByBarcode(barcode: string): Promise<Product> {
  const { data } = await api.get<Product>(`/products/barcode/${barcode}`);
  return data;
}

export async function createProduct(payload: ProductPayload): Promise<Product> {
  const { data } = await api.post<Product>("/products", payload);
  return data;
}

export async function updateProduct(id: string, payload: ProductPayload): Promise<Product> {
  const { data } = await api.put<Product>(`/products/${id}`, payload);
  return data;
}

export async function deleteProduct(id: string): Promise<void> {
  await api.delete(`/products/${id}`);
}
