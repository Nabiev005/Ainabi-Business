import { api } from "./api";
import type { CashShift, CashShiftListItem, Paginated } from "../types";

export async function getCurrentShift(): Promise<CashShift | null> {
  const { data } = await api.get<CashShift | null>("/shifts/current");
  return data || null;
}

export async function openShift(openingCash: number): Promise<CashShift> {
  const { data } = await api.post<CashShift>("/shifts/open", { openingCash });
  return data;
}

export async function closeShift(id: string, countedCash: number, note?: string | null): Promise<CashShift> {
  const { data } = await api.post<CashShift>(`/shifts/${id}/close`, { countedCash, note });
  return data;
}

export async function addCashMovement(payload: { type: "IN" | "OUT"; amount: number; reason?: string | null }): Promise<CashShift> {
  const { data } = await api.post<CashShift>("/shifts/cash", payload);
  return data;
}

export async function listShifts(params: { page?: number; pageSize?: number }): Promise<Paginated<CashShiftListItem>> {
  const { data } = await api.get<Paginated<CashShiftListItem>>("/shifts", { params });
  return data;
}

export async function getShift(id: string): Promise<CashShift> {
  const { data } = await api.get<CashShift>(`/shifts/${id}`);
  return data;
}
