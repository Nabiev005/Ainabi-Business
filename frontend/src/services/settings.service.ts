import { api } from "./api";
import type { Business, BusinessTemplate, ProductFieldDef } from "../types";

export async function getBusiness(): Promise<Business> {
  const { data } = await api.get<Business>("/settings/business");
  return data;
}

export async function updateBusiness(payload: {
  name: string;
  phone?: string | null;
  address?: string | null;
  currency: string;
  qrPaymentInfo?: string | null;
}): Promise<Business> {
  const { data } = await api.put<Business>("/settings/business", payload);
  return data;
}

export async function listTemplates(): Promise<BusinessTemplate[]> {
  const { data } = await api.get<BusinessTemplate[]>("/settings/templates");
  return data;
}

export async function applyTemplate(payload: { businessType: string; addCategories: boolean; addFields: boolean }): Promise<Business> {
  const { data } = await api.post<Business>("/settings/business-type", payload);
  return data;
}

export async function updateProductConfig(payload: {
  productFields: ProductFieldDef[];
  trackSerials: boolean;
  trackWarranty: boolean;
}): Promise<Business> {
  const { data } = await api.put<Business>("/settings/product-config", payload);
  return data;
}
