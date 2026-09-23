import { api } from "./api";
import type {
  AttributeValue,
  ImportResult,
  Paginated,
  Product,
  ProductBatch,
  ProductPackage,
  ProductSerialUnit,
  ProductUnit,
  ScannedProduct,
  VariantDimension,
  VariantGroup,
} from "../types";

export interface ProductQuery {
  search?: string;
  categoryId?: string;
  status?: "ACTIVE" | "ARCHIVED";
  stock?: "low" | "out";
  locationId?: string;
  variantGroupId?: string;
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
  wholesalePrice?: number | null;
  quantity: number;
  minQuantity: number;
  unit: ProductUnit;
  imageUrl?: string | null;
  description?: string | null;
  attributes?: Record<string, AttributeValue | null>;
  requiresSerial?: boolean;
  warrantyMonths?: number | null;
  prescriptionRequired?: boolean;
  scaleCode?: string | null;
  packages?: ProductPackage[];
  locationId?: string | null;
  initialExpiryDate?: string | null;
  initialBatchNumber?: string | null;
}

export interface VariantGroupPayload {
  groupId?: string;
  name: string;
  categoryId?: string | null;
  unit: ProductUnit;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice?: number | null;
  minQuantity: number;
  description?: string | null;
  imageUrl?: string | null;
  attributes?: Record<string, AttributeValue | null>;
  requiresSerial?: boolean;
  warrantyMonths?: number | null;
  dimensions: VariantDimension[];
  variants: {
    options: Record<string, string>;
    quantity: number;
    purchasePrice?: number | null;
    salePrice?: number | null;
    barcode?: string | null;
  }[];
}

export async function listProducts(query: ProductQuery): Promise<Paginated<Product>> {
  const { data } = await api.get<Paginated<Product>>("/products", { params: query });
  return data;
}

export async function getProduct(id: string, locationId?: string): Promise<Product> {
  const { data } = await api.get<Product>(`/products/${id}`, { params: { locationId } });
  return data;
}

/** Resolves a product barcode, a package barcode or a scale (weight) label. */
export async function findByBarcode(barcode: string, locationId?: string): Promise<ScannedProduct> {
  const { data } = await api.get<ScannedProduct>(`/products/barcode/${encodeURIComponent(barcode)}`, { params: { locationId } });
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

export async function createVariantGroup(payload: VariantGroupPayload): Promise<{ groupId: string; name: string; created: Product[] }> {
  const { data } = await api.post("/products/variant-groups", payload);
  return data;
}

export async function getVariantGroup(groupId: string): Promise<VariantGroup> {
  const { data } = await api.get<VariantGroup>(`/products/variant-groups/${groupId}`);
  return data;
}

export async function getAnalogs(productId: string, locationId?: string): Promise<Product[]> {
  const { data } = await api.get<Product[]>(`/products/${productId}/analogs`, { params: { locationId } });
  return data;
}

export async function setAnalogs(productId: string, analogIds: string[]): Promise<Product[]> {
  const { data } = await api.put<Product[]>(`/products/${productId}/analogs`, { analogIds });
  return data;
}

export async function listSerials(productId: string, status?: "IN_STOCK" | "SOLD"): Promise<ProductSerialUnit[]> {
  const { data } = await api.get<ProductSerialUnit[]>(`/products/${productId}/serials`, { params: { status } });
  return data;
}

export async function listBatches(productId: string): Promise<ProductBatch[]> {
  const { data } = await api.get<ProductBatch[]>(`/products/${productId}/batches`);
  return data;
}

export async function importProducts(payload: {
  rows: Record<string, unknown>[];
  updateExisting: boolean;
  locationId?: string | null;
}): Promise<ImportResult> {
  const { data } = await api.post<ImportResult>("/products/import", payload, { timeout: 120000 });
  return data;
}
