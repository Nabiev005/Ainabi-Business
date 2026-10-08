import { api } from "./api";
import type { Debt, DebtDetail, DebtSchedulePayload, PaymentMethod } from "../types";

export interface DebtSummary {
  totalOutstanding: number;
  openDebts: number;
  overdueAmount: number;
  overdueCount: number;
  remindToday: number;
}

export async function listDebts(status?: "OPEN" | "ALL"): Promise<Debt[]> {
  const { data } = await api.get<Debt[]>("/debts", { params: { status } });
  return data;
}

export async function getDebtSummary(): Promise<DebtSummary> {
  const { data } = await api.get<DebtSummary>("/debts/summary");
  return data;
}

export async function createDebt(payload: { customerId: string; totalAmount: number; comment?: string | null } & DebtSchedulePayload): Promise<Debt> {
  const { data } = await api.post<Debt>("/debts", payload);
  return data;
}

export async function addDebtPayment(
  debtId: string,
  payload: { amount: number; method: Exclude<PaymentMethod, "DEBT">; comment?: string | null },
): Promise<void> {
  await api.post(`/debts/${debtId}/payments`, payload);
}

/** Overdue or due within a few days, with a phone number — who to remind today. */
export async function listReminders(): Promise<Debt[]> {
  const { data } = await api.get<Debt[]>("/debts/reminders");
  return data;
}

export async function getDebt(id: string): Promise<DebtDetail> {
  const { data } = await api.get<DebtDetail>(`/debts/${id}`);
  return data;
}

export async function setDebtSchedule(id: string, payload: DebtSchedulePayload): Promise<DebtDetail> {
  const { data } = await api.put<DebtDetail>(`/debts/${id}/schedule`, payload);
  return data;
}

export async function markReminded(id: string): Promise<void> {
  await api.post(`/debts/${id}/reminded`);
}
