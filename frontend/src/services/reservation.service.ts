import { api } from "./api";
import type { ProductUnit } from "../types";

export type ReservationStatus = "ACTIVE" | "COMPLETED" | "CANCELLED" | "EXPIRED";

export interface Reservation {
  id: string;
  number: number;
  status: ReservationStatus;
  customerId: string | null;
  customerName: string | null;
  phone: string | null;
  locationId: string;
  locationName: string | null;
  employeeName: string;
  note: string | null;
  expiresAt: string | null;
  saleId: string | null;
  createdAt: string;
  items: { productId: string; name: string; unit: ProductUnit; quantity: number; price: number }[];
  total: number;
}

export interface CreateReservationPayload {
  customerId?: string | null;
  customerName?: string | null;
  phone?: string | null;
  locationId?: string | null;
  note?: string | null;
  /** 0 = held until sold or cancelled. */
  expiresInDays: number;
  items: { productId: string; quantity: number }[];
}

export async function listReservations(status: "ACTIVE" | "ALL"): Promise<Reservation[]> {
  const { data } = await api.get<Reservation[]>("/reservations", { params: { status } });
  return data;
}

export async function getReservation(id: string): Promise<Reservation> {
  const { data } = await api.get<Reservation>(`/reservations/${id}`);
  return data;
}

export async function createReservation(payload: CreateReservationPayload): Promise<Reservation> {
  const { data } = await api.post<Reservation>("/reservations", payload);
  return data;
}

export async function cancelReservation(id: string): Promise<Reservation> {
  const { data } = await api.post<Reservation>(`/reservations/${id}/cancel`);
  return data;
}
