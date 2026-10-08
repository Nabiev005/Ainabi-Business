import { api } from "./api";
import type { ReportPreset } from "./report.service";

export type RiskLevel = "OK" | "LOW" | "MEDIUM" | "HIGH";
export type SignalKey =
  | "discountRate"
  | "maxedDiscounts"
  | "belowCost"
  | "wholesaleNoCustomer"
  | "returns"
  | "cashShort"
  | "stockOut"
  | "inventoryShortage"
  | "nightSales";
export type RiskEventType = "BELOW_COST" | "MAX_DISCOUNT" | "WHOLESALE" | "CASH_SHORT" | "STOCK_OUT" | "INVENTORY_SHORTAGE" | "NIGHT_SALE" | "RETURN";

export interface RiskReport {
  range: { from: string; to: string };
  maxDiscountPercent: number;
  people: {
    employeeId: string;
    name: string;
    revenue: number;
    salesCount: number;
    score: number;
    level: RiskLevel;
    signals: { key: SignalKey; weight: 1 | 2; value: number }[];
  }[];
  events: {
    type: RiskEventType;
    at: string;
    employeeName: string;
    amount: number;
    saleId?: string;
    saleNumber?: number | null;
    note?: string | null;
  }[];
}

export async function getRiskReport(preset: ReportPreset, from?: string, to?: string): Promise<RiskReport> {
  const { data } = await api.get<RiskReport>("/insights/risk", { params: { preset, from, to } });
  return data;
}
