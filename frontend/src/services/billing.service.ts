import { api } from "./api";

export type PlanId = "BASIC" | "PRO" | "MAX";
export type Feature =
  | "tasks"
  | "pipeline"
  | "analytics"
  | "repairs"
  | "receiving"
  | "inventory"
  | "loyalty"
  | "reservations"
  | "wholesale"
  | "ai"
  | "risk"
  | "telegram"
  | "crm";

/** In the order the plan cards list them (backend config/plans.ts decides who gets what). */
export const ALL_FEATURES: Feature[] = [
  "receiving",
  "inventory",
  "repairs",
  "tasks",
  "pipeline",
  "analytics",
  "loyalty",
  "reservations",
  "wholesale",
  "ai",
  "risk",
  "telegram",
  "crm",
];
const MAX_ONLY: Feature[] = ["ai", "risk", "telegram", "crm"];
/** The cheapest plan that has the module. */
export const planFor = (feature: Feature): PlanId => (MAX_ONLY.includes(feature) ? "MAX" : "PRO");

export interface SubscriptionInfo {
  plan: PlanId;
  isTrial: boolean;
  /** Free for good — no expiry, no limits. */
  complimentary?: boolean;
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
  sales7d: number;
  sales30d: number;
  /** Judged by the last sale: ACTIVE within a week, SLOWING within two, then INACTIVE. */
  health: "NEW" | "ACTIVE" | "SLOWING" | "INACTIVE";
  ownerVerified: boolean;
  subscription: SubscriptionInfo;
}

export interface OverviewBusiness {
  id: string;
  name: string;
  ownerName: string;
  phone: string | null;
  plan: PlanId;
  isTrial: boolean;
  expiresAt: string | null;
  daysLeft: number;
  lastSaleAt: string | null;
  sales30d: number;
}

export interface PlatformOverview {
  totals: { businesses: number; paying: number; trials: number; complimentary: number; expired: number; newLast30Days: number; activeLast7Days: number };
  mrr: number;
  revenueByMonth: { month: string; amount: number }[];
  expiringSoon: OverviewBusiness[];
  atRisk: OverviewBusiness[];
  mostActive: OverviewBusiness[];
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const { data } = await api.get<PlatformOverview>("/platform/overview");
  return data;
}

/** Public price list (landing page — no sign-in). */
export async function getPublicPlans(): Promise<{ plans: PlanDefinition[]; trialDays: number; trialPlan: PlanId }> {
  const { data } = await api.get<{ plans: PlanDefinition[]; trialDays: number; trialPlan: PlanId }>("/billing/plans");
  return data;
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

/** Platform admin: end a business's subscription now (read-only until it pays). */
export async function blockBusiness(businessId: string): Promise<SubscriptionInfo> {
  const { data } = await api.post<SubscriptionInfo>(`/platform/businesses/${businessId}/block`);
  return data;
}

/** Platform admin: free for good (no expiry, every module, no limits). */
export async function setComplimentary(businessId: string, complimentary: boolean): Promise<SubscriptionInfo> {
  const { data } = await api.post<SubscriptionInfo>(`/platform/businesses/${businessId}/complimentary`, { complimentary });
  return data;
}
