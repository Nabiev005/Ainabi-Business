import { api } from "./api";
import type { Paginated, RepairOrder, RepairStatus } from "../types";

export interface RepairPayload {
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  device: string;
  serial?: string | null;
  problem: string;
  notes?: string | null;
  estimatedPrice?: number | null;
  prepayment?: number;
}

export async function listRepairs(params: {
  status?: RepairStatus | "ACTIVE";
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<RepairOrder> & { counts: Partial<Record<RepairStatus, number>> }> {
  const { data } = await api.get("/repairs", { params });
  return data;
}

export async function getRepair(id: string): Promise<RepairOrder> {
  const { data } = await api.get<RepairOrder>(`/repairs/${id}`);
  return data;
}

export async function createRepair(payload: RepairPayload): Promise<RepairOrder> {
  const { data } = await api.post<RepairOrder>("/repairs", payload);
  return data;
}

export async function updateRepair(id: string, payload: Partial<RepairPayload> & { finalPrice?: number | null }): Promise<RepairOrder> {
  const { data } = await api.put<RepairOrder>(`/repairs/${id}`, payload);
  return data;
}

export async function changeRepairStatus(
  id: string,
  payload: { status: RepairStatus; finalPrice?: number | null; paymentMethod?: "CASH" | "CARD" | "QR" },
): Promise<RepairOrder> {
  const { data } = await api.post<RepairOrder>(`/repairs/${id}/status`, payload);
  return data;
}
