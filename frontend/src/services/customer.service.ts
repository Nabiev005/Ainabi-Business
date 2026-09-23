import { api } from "./api";
import type { Customer, CustomerDetail } from "../types";

export interface CustomerPayload {
  name: string;
  phone?: string | null;
  notes?: string | null;
  isWholesale?: boolean;
}

export async function listCustomers(search?: string): Promise<Customer[]> {
  const { data } = await api.get<Customer[]>("/customers", { params: { search } });
  return data;
}

export async function getCustomer(id: string): Promise<CustomerDetail> {
  const { data } = await api.get<CustomerDetail>(`/customers/${id}`);
  return data;
}

export async function createCustomer(payload: CustomerPayload): Promise<Customer> {
  const { data } = await api.post<Customer>("/customers", payload);
  return data;
}

export async function updateCustomer(id: string, payload: CustomerPayload): Promise<Customer> {
  const { data } = await api.put<Customer>(`/customers/${id}`, payload);
  return data;
}

export async function deleteCustomer(id: string): Promise<void> {
  await api.delete(`/customers/${id}`);
}
