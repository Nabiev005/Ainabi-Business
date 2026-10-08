import { api } from "./api";

export interface CatalogSettings {
  catalogEnabled: boolean;
  catalogSlug: string | null;
  catalogWhatsapp: string | null;
  catalogShowStock: boolean;
  catalogNote: string | null;
}

export interface PublicCatalog {
  shop: { name: string; address: string | null; phone: string | null; whatsapp: string | null; note: string | null };
  categories: { id: string; name: string }[];
  items: { id: string; name: string; price: number; unit: string; imageUrl: string | null; description: string | null; category: string | null; quantity: number | null }[];
  page: number;
  totalPages: number;
  total: number;
}

export async function getCatalogSettings(): Promise<CatalogSettings> {
  const { data } = await api.get<CatalogSettings>("/settings/catalog");
  return data;
}

export async function updateCatalogSettings(payload: { enabled: boolean; slug: string; whatsapp: string; showStock: boolean; note: string }): Promise<CatalogSettings> {
  const { data } = await api.put<CatalogSettings>("/settings/catalog", payload);
  return data;
}

export async function getPublicCatalog(slug: string, params: { search?: string; categoryId?: string; page?: number }): Promise<PublicCatalog> {
  const { data } = await api.get<PublicCatalog>(`/public/catalog/${encodeURIComponent(slug)}`, { params });
  return data;
}

export const catalogUrl = (slug: string) => `${window.location.origin}/c/${slug}`;
