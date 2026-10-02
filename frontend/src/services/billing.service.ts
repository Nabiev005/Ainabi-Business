import { api } from "./api";

export type PlanId = "BASIC" | "PRO" | "MAX";
export type Feature = "tasks" | "pipeline" | "analytics" | "repairs" | "receiving" | "inventory";

export interface SubscriptionInfo {
  plan: PlanId;
  isTrial: boolean;
  expiresAt: string | null;
  active: boolean;
  daysLeft: number;
  endingSoon: boolean;
  features: Feature[];
  maxEmployees: number | null;
  maxLocations: number | null;
}

export interface PlanDefinition {
  id: PlanId;
  priceMonthly: number;
  priceYearly: number;
  maxEmployees: number | null;
  maxLocations: number | null;
  features: Feature[];
}

export interface BillingData {
  businessId: string;
  businessName: string;
  subscription: SubscriptionInfo;
  usage: { employees: number; locations: number };
  plans: PlanDefinition[];
  paymentInfo: string | null;
  /** Payment QR image (ELQR — any bank app can pay it). */
  paymentQr: string | null;
  supportWhatsapp: string;
  payments: { id: string; plan: PlanId; months: number; amount: number; periodStart: string; periodEnd: string; createdAt: string }[];
}

export interface PlatformBusiness {
  id: string;
  name: string;
  phone: string | null;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string | null;
  createdAt: string;
  employees: number;
  sales: number;
  products: number;
  lastSaleAt: string | null;
  subscription: SubscriptionInfo;
}

export async function getBilling(): Promise<BillingData> {
  const { data } = await api.get<BillingData>("/billing");
  return data;
}

export async function listPlatformBusinesses(search?: string): Promise<{ plans: PlanDefinition[]; businesses: PlatformBusiness[] }> {
  const { data } = await api.get<{ plans: PlanDefinition[]; businesses: PlatformBusiness[] }>("/platform/businesses", {
    params: { search: search || undefined },
  });
  return data;
}

export interface PlatformPayments {
  thisMonth: { amount: number; count: number };
  allTime: number;
  payments: {
    id: string;
    businessId: string;
    businessName: string;
    ownerEmail: string;
    plan: PlanId;
    months: number;
    amount: number;
    note: string | null;
    periodEnd: string;
    createdAt: string;
  }[];
}

export async function listPlatformPayments(): Promise<PlatformPayments> {
  const { data } = await api.get<PlatformPayments>("/platform/payments");
  return data;
}

export async function recordPayment(
  businessId: string,
  payload: { plan: PlanId; months: number; days?: number; amount: number; note?: string | null },
): Promise<SubscriptionInfo> {
  const { data } = await api.post<SubscriptionInfo>(`/platform/businesses/${businessId}/subscription`, payload);
  return data;
}
