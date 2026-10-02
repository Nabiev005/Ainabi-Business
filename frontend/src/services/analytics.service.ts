import { api } from "./api";
import type { ReportPreset } from "./report.service";
import type { Role } from "../types";

export interface ProfitAndLoss {
  grossSales: number;
  returns: number;
  discounts: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  repairRevenue: number;
  expenses: number;
  writeOffLoss: number;
  shortageLoss: number;
  surplusGain: number;
  stockLosses: number;
  netProfit: number;
  salesCount: number;
  avgCheck: number;
  marginPercent: number;
}

export interface TeamMemberStats {
  employeeId: string;
  name: string;
  role: Role;
  status: "ACTIVE" | "INACTIVE";
  lastLoginAt: string | null;
  salesCount: number;
  revenue: number;
  profit: number;
  discounts: number;
  returnsProcessed: number;
  repairsDelivered: number;
  receiptsCount: number;
  receiptsTotal: number;
  stageMoves: number;
  tasksDone: number;
  tasksOpen: number;
  tasksOverdue: number;
  shiftsClosed: number;
  cashDifference: number;
}

export interface AnalyticsData {
  range: { from: string; to: string };
  statement: ProfitAndLoss;
  previous: ProfitAndLoss;
  /** Percent vs the previous period of the same length (null = nothing to compare with). */
  changes: Record<"revenue" | "grossProfit" | "expenses" | "netProfit" | "salesCount", number | null>;
  expensesByCategory: { category: string; amount: number }[];
  series: { date: string; revenue: number; expenses: number; profit: number }[];
  team: TeamMemberStats[];
  tasks: { open: number; overdue: number; doneInPeriod: number };
}

export async function getAnalytics(preset: ReportPreset, from?: string, to?: string): Promise<AnalyticsData> {
  const { data } = await api.get<AnalyticsData>("/analytics", { params: { preset, from, to } });
  return data;
}
