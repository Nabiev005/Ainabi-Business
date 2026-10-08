import { api } from "./api";

export interface CurrencySettings {
  usdRate: number | null;
  usdRateDate: string | null;
  usdRateAuto: boolean;
  priceRounding: number;
  /** Today's National Bank rate (null if the bank couldn't be reached). */
  nbkrRate: number | null;
  usdProducts: number;
}

export async function getCurrency(): Promise<CurrencySettings> {
  const { data } = await api.get<CurrencySettings>("/settings/currency");
  return data;
}

export async function updateCurrency(payload: { usdRateAuto: boolean; usdRate?: number | null; priceRounding: number }): Promise<CurrencySettings> {
  const { data } = await api.put<CurrencySettings>("/settings/currency", payload);
  return data;
}
