/**
 * Subscription plans — prices, limits and which modules each one unlocks.
 * Change prices or limits here; everything else (API checks, the billing
 * page, the platform admin panel) reads from this file.
 *
 * A business whose subscription ran out drops to read-only: it can still
 * see all of its data (nothing is ever deleted), but can't change anything
 * until the owner pays and the platform admin extends it.
 */
export const PLAN_IDS = ["BASIC", "PRO", "MAX"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Modules that only some plans include. Everything else is in every plan. */
export const FEATURES = ["tasks", "pipeline", "analytics", "repairs", "receiving", "inventory"] as const;
export type Feature = (typeof FEATURES)[number];

export interface PlanDefinition {
  id: PlanId;
  /** Monthly price in som. */
  priceMonthly: number;
  /** Paying for 12 months up front costs this (2 months free). */
  priceYearly: number;
  /** null = unlimited. Counts active non-owner employees. */
  maxEmployees: number | null;
  /** null = unlimited. Counts non-archived branches. */
  maxLocations: number | null;
  features: Feature[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  BASIC: { id: "BASIC", priceMonthly: 990, priceYearly: 9900, maxEmployees: 3, maxLocations: 1, features: [] },
  PRO: {
    id: "PRO",
    priceMonthly: 1990,
    priceYearly: 19900,
    maxEmployees: 10,
    maxLocations: 3,
    features: ["tasks", "pipeline", "analytics", "repairs", "receiving", "inventory"],
  },
  MAX: { id: "MAX", priceMonthly: 3490, priceYearly: 34900, maxEmployees: null, maxLocations: null, features: [...FEATURES] },
};

/** New businesses (and existing ones at rollout) start with this. */
export const TRIAL_PLAN: PlanId = "PRO";
export const TRIAL_DAYS = 14;
/** Show the "ending soon" warning this many days before expiry. */
export const WARN_DAYS = 3;

export function trialEndsAt(from = new Date()) {
  const end = new Date(from);
  end.setDate(end.getDate() + TRIAL_DAYS);
  return end;
}

export function subscriptionInfo(business: { plan: PlanId; planExpiresAt: Date | null; isTrial: boolean }) {
  const plan = PLANS[business.plan];
  const now = Date.now();
  const expiresAt = business.planExpiresAt;
  const active = !!expiresAt && expiresAt.getTime() > now;
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now) / 86_400_000)) : 0;
  return {
    plan: plan.id,
    isTrial: business.isTrial,
    expiresAt,
    active,
    daysLeft,
    endingSoon: active && daysLeft <= WARN_DAYS,
    // Modules of the plan stay visible after expiry (read-only) — the write
    // block is separate, in requireAuth.
    features: plan.features,
    maxEmployees: plan.maxEmployees,
    maxLocations: plan.maxLocations,
  };
}

export type SubscriptionInfo = ReturnType<typeof subscriptionInfo>;
