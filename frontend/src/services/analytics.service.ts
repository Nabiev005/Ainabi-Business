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

/** This calendar month at the current pace vs the owner's revenue plan. */
export interface MonthForecast {
  month: string;
  plan: number | null;
  daysInMonth: number;
  daysElapsed: number;
  /** "recent" = the month just started, so the pace is the last 14 days. */
  basis: "month" | "recent";
  actual: number;
  actualProfit: number;
  avgDaily: number;
  forecast: number;
  forecastProfit: number;
  actualPercent: number | null;
  forecastPercent: number | null;
  neededPerDay: number | null;
  cumulative: { date: string; actual: number | null; forecast: number | null }[];
}

export interface AnalyticsData {
  range: { from: string; to: string };
  statement: ProfitAndLoss;
  previous: ProfitAndLoss;
  /** Percent vs the previous period of the same length (null = nothing to compare with). */
  changes: Record<"revenue" | "grossProfit" | "expenses" | "netProfit" | "salesCount", number | null>;
  expensesByCategory: { category: string; amount: number }[];
  series: { date: string; revenue: number; expenses: number; profit: number }[];
  forecast: MonthForecast;
  team: TeamMemberStats[];
  tasks: { open: number; overdue: number; doneInPeriod: number };
}

export async function getAnalytics(preset: ReportPreset, from?: string, to?: string): Promise<AnalyticsData> {
  const { data } = await api.get<AnalyticsData>("/analytics", { params: { preset, from, to } });
  return data;
}

/** null clears the plan. */
export async function setMonthlyPlan(monthlyRevenuePlan: number | null): Promise<{ monthlyRevenuePlan: number | null }> {
  const { data } = await api.put<{ monthlyRevenuePlan: number | null }>("/analytics/plan", { monthlyRevenuePlan });
  return data;
}
