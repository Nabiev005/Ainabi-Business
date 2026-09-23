import { api } from "./api";

export type ReportPreset = "today" | "yesterday" | "7d" | "30d" | "month" | "prevMonth" | "custom";

export interface ReportData {
  range: { from: string; to: string };
  summary: {
    totalSales: number;
    netProfit: number;
    grossProfit: number;
    totalExpenses: number;
    totalCogs: number;
    totalDiscount: number;
    totalReturns: number;
    repairRevenue: number;
    repairsCount: number;
    salesCount: number;
    avgCheck: number;
  };
  bestSelling: { productId: string; name: string; quantitySold: number; revenue: number; profit: number } | null;
  mostProfitable: { productId: string; name: string; quantitySold: number; revenue: number; profit: number } | null;
  productPerformance: { productId: string; name: string; quantitySold: number; revenue: number; profit: number }[];
  series: { date: string; sales: number; expenses: number }[];
}

export async function getReport(preset: ReportPreset, from?: string, to?: string): Promise<ReportData> {
  const { data } = await api.get<ReportData>("/reports", { params: { preset, from, to } });
  return data;
}

/** Downloads the report as CSV. Uses axios (not a plain <a href>) so the auth header is sent. */
export async function downloadReportCsv(preset: ReportPreset, from?: string, to?: string): Promise<void> {
  const response = await api.get("/reports/export.csv", {
    params: { preset, from, to },
    responseType: "blob",
  });
  const url = URL.createObjectURL(new Blob([response.data], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `ainabi-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
