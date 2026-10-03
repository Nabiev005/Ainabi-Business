import { api } from "./api";
import type { PaymentMethod, ProductUnit } from "../types";

export type Insight =
  | { type: "stale"; severity: "warning"; count: number; frozenValue: number; items: { name: string; idleDays: number; quantity: number }[] }
  | { type: "reorder"; severity: "danger"; items: { name: string; perMonth: number; left: number; daysLeft: number }[] }
  | { type: "lowMargin"; severity: "warning"; items: { name: string; marginPercent: number; sold: number }[] }
  | { type: "topProfit"; severity: "success"; name: string; sharePercent: number; profit: number }
  | { type: "discounts"; severity: "warning"; name: string; amount: number; timesAverage: number }
  | { type: "bestDays"; severity: "info"; days: number[]; sharePercent: number }
  | { type: "overdueDebts"; severity: "danger"; count: number; amount: number }
  | { type: "expenses"; severity: "warning"; expensesChange: number; revenueChange: number | null; topCategory: string | null }
  | { type: "returns"; severity: "warning"; ratePercent: number; amount: number; items: { name: string; count: number }[]; reasons: string[] };

export interface MonthlyInsights {
  month: string;
  summary: {
    revenue: number;
    netProfit: number;
    grossProfit: number;
    expenses: number;
    salesCount: number;
    avgCheck: number;
    revenueChange: number | null;
    netProfitChange: number | null;
  };
  insights: Insight[];
}

export interface ReturnsJournal {
  summary: { count: number; amount: number };
  items: {
    id: string;
    saleId: string;
    saleNumber: number | null;
    soldAt: string;
    customer: { name: string; phone: string | null } | null;
    total: number;
    refundMethod: PaymentMethod;
    reason: string | null;
    employeeName: string;
    createdAt: string;
    items: { productName: string; quantity: number; serialNumbers: string[] }[];
  }[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface StaleStock {
  days: number;
  /** null for roles that don't see cost prices (the seller). */
  frozenValue: number | null;
  items: {
    productId: string;
    name: string;
    sku: string | null;
    categoryName: string | null;
    quantity: number;
    unit: ProductUnit;
    salePrice: number;
    purchasePrice?: number;
    frozenValue?: number;
    lastSoldAt: string | null;
    idleDays: number;
  }[];
}

export async function getMonthlyInsights(month?: string): Promise<MonthlyInsights> {
  const { data } = await api.get<MonthlyInsights>("/insights/monthly", { params: { month } });
  return data;
}

export async function getReturns(params: { from?: string; to?: string; page: number }): Promise<ReturnsJournal> {
  const { data } = await api.get<ReturnsJournal>("/insights/returns", { params });
  return data;
}

export async function getStaleStock(days: number): Promise<StaleStock> {
  const { data } = await api.get<StaleStock>("/insights/stale", { params: { days } });
  return data;
}
