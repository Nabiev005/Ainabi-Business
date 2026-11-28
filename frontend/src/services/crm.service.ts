import { api } from "./api";

export type CrmSegment = "lapsed" | "top" | "newcomers" | "birthdays" | "tag" | "all";
export type ActivityKind = "NOTE" | "CALL" | "MESSAGE" | "FOLLOW_UP";

export interface CrmOverview {
  customers: number;
  buyers: number;
  repeatRate: number;
  segments: { lapsed: number; top: number; newcomers: number; birthdays: number };
  tags: { tag: string; count: number }[];
  followUpsDue: number;
}

export interface CrmCustomerRow {
  id: string;
  name: string;
  phone: string | null;
  tags: string[];
  birthday: string | null;
  purchaseCount: number;
  totalSpent: number;
  averageCheck: number;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  daysSinceLastPurchase: number | null;
  daysToBirthday: number | null;
}

export interface CrmActivity {
  id: string;
  customerId: string;
  kind: ActivityKind;
  text: string;
  dueAt: string | null;
  doneAt: string | null;
  createdAt: string;
  employeeName: string | null;
}

export interface FollowUp extends CrmActivity {
  customerName: string;
  customerPhone: string | null;
  overdue: boolean;
}

export async function getOverview(days: number) {
  const { data } = await api.get<CrmOverview>("/crm/overview", { params: { days } });
  return data;
}

export async function listCustomers(params: { segment: CrmSegment; days?: number; tag?: string; search?: string }) {
  const { data } = await api.get<CrmCustomerRow[]>("/crm/customers", { params });
  return data;
}

export async function listFollowUps(when: "due" | "upcoming") {
  const { data } = await api.get<FollowUp[]>("/crm/follow-ups", { params: { when } });
  return data;
}

export async function getTimeline(customerId: string) {
  const { data } = await api.get<{ tags: string[]; birthday: string | null; items: CrmActivity[] }>(`/crm/customers/${customerId}/activities`);
  return data;
}

export async function addActivity(customerId: string, payload: { kind: ActivityKind; text: string; dueAt?: string | null }) {
  const { data } = await api.post<CrmActivity>(`/crm/customers/${customerId}/activities`, payload);
  return data;
}

export async function saveProfile(customerId: string, payload: { tags: string[]; birthday: string | null }) {
  const { data } = await api.put<{ id: string; tags: string[]; birthday: string | null }>(`/crm/customers/${customerId}/profile`, payload);
  return data;
}

export async function setDone(activityId: string, done: boolean) {
  const { data } = await api.post<CrmActivity>(`/crm/activities/${activityId}/done`, { done });
  return data;
}

export async function deleteActivity(activityId: string) {
  await api.delete(`/crm/activities/${activityId}`);
}
