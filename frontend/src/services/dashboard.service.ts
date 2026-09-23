import { api } from "./api";
import type { DashboardRange, DashboardSummary, LowStockProduct, SalesDynamicsPoint, TopProduct, DashboardAlerts } from "../types";

export async function getDashboardSummary(range: DashboardRange): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>("/dashboard/summary", { params: { range } });
  return data;
}

export async function getSalesDynamics(days = 7): Promise<SalesDynamicsPoint[]> {
  const { data } = await api.get<SalesDynamicsPoint[]>("/dashboard/sales-dynamics", { params: { days } });
  return data;
}

export async function getTopProducts(range: DashboardRange): Promise<TopProduct[]> {
  const { data } = await api.get<TopProduct[]>("/dashboard/top-products", { params: { range } });
  return data;
}

export async function getLowStock(): Promise<LowStockProduct[]> {
  const { data } = await api.get<LowStockProduct[]>("/dashboard/low-stock");
  return data;
}

export async function getAlerts(): Promise<DashboardAlerts> {
  const { data } = await api.get<DashboardAlerts>("/dashboard/alerts");
  return data;
}
