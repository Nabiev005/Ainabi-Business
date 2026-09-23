import { api } from "./api";
import type { Employee, EmployeeStatus, Role } from "../types";

export async function listEmployees(): Promise<Employee[]> {
  const { data } = await api.get<Employee[]>("/employees");
  return data;
}

export async function inviteEmployee(payload: {
  name: string;
  email: string;
  phone?: string | null;
  password: string;
  role: Exclude<Role, "OWNER">;
  locationId?: string | null;
}): Promise<Employee> {
  const { data } = await api.post<Employee>("/employees", payload);
  return data;
}

export async function updateEmployee(
  id: string,
  payload: { role?: Exclude<Role, "OWNER">; status?: EmployeeStatus; locationId?: string | null },
): Promise<Employee> {
  const { data } = await api.put<Employee>(`/employees/${id}`, payload);
  return data;
}

export async function deleteEmployee(id: string): Promise<void> {
  await api.delete(`/employees/${id}`);
}
