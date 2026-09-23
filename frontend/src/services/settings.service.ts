import { api } from "./api";
import type { Business, BusinessModules, BusinessTemplate, Location, ProductFieldDef } from "../types";

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

export async function updateProductConfig(payload: { productFields: ProductFieldDef[] } & BusinessModules): Promise<Business> {
  const { data } = await api.put<Business>("/settings/product-config", payload);
  return data;
}

export async function listLocations(): Promise<Location[]> {
  const { data } = await api.get<Location[]>("/settings/locations");
  return data;
}

export async function createLocation(payload: { name: string; address?: string | null }): Promise<Location> {
  const { data } = await api.post<Location>("/settings/locations", payload);
  return data;
}

export async function updateLocation(id: string, payload: { name: string; address?: string | null; archived?: boolean }): Promise<Location> {
  const { data } = await api.put<Location>(`/settings/locations/${id}`, payload);
  return data;
}
