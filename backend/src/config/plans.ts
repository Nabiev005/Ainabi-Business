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
export const FEATURES = [
  "tasks",
  "pipeline",
  "analytics",
  "repairs",
  "receiving",
  "inventory",
  // Pro and up (were open to everyone before the 2026-11 split)
  "loyalty",
  "reservations",
  "wholesale",
  // Max only
  "ai",
  "risk",
  "telegram",
  "crm",
] as const;
export type Feature = (typeof FEATURES)[number];

const PRO_FEATURES: Feature[] = ["tasks", "pipeline", "analytics", "repairs", "receiving", "inventory", "loyalty", "reservations", "wholesale"];

/**
 * What a business already had before the plans were split (2026-11): every
 * plan had loyalty, reservations, wholesale buying, slow stock and Telegram
 * reports, and Pro/Max also had the AI assistant and the risk report under
 * "analytics". Businesses that were paying (or on trial) at rollout keep
 * these until `legacyFeaturesUntil` — their next payment starts the new rules.
 */
const LEGACY_EXTRAS: Record<PlanId, Feature[]> = {
  BASIC: ["loyalty", "reservations", "wholesale", "telegram", "risk"],
  PRO: ["loyalty", "reservations", "wholesale", "telegram", "risk", "ai"],
  MAX: [],
};

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
  PRO: { id: "PRO", priceMonthly: 1990, priceYearly: 19900, maxEmployees: 10, maxLocations: 3, features: PRO_FEATURES },
  MAX: { id: "MAX", priceMonthly: 3490, priceYearly: 34900, maxEmployees: null, maxLocations: null, features: [...FEATURES] },
};

/** New businesses (and existing ones at rollout) start with this. */
export const TRIAL_PLAN: PlanId = "PRO";
export const TRIAL_DAYS = 14;
/** Show the "ending soon" warning this many days before expiry. */
export const WARN_DAYS = 3;

/** Trial for a password sign-up that hasn't confirmed its email yet. */
export const UNVERIFIED_TRIAL_DAYS = 3;

export function trialEndsAt(from = new Date(), days = TRIAL_DAYS) {
  const end = new Date(from);
  end.setDate(end.getDate() + days);
  return end;
}

export function subscriptionInfo(business: {
  plan: PlanId;
  planExpiresAt: Date | null;
  isTrial: boolean;
  complimentary?: boolean;
  legacyFeaturesUntil?: Date | null;
}) {
  if (business.complimentary) {
    // Free for good: behaves like Max that never runs out.
    return {
      plan: "MAX" as PlanId,
      isTrial: false,
      complimentary: true,
      expiresAt: null,
      active: true,
      daysLeft: 0,
      endingSoon: false,
      features: [...FEATURES] as Feature[],
      maxEmployees: null as number | null,
      maxLocations: null as number | null,
    };
  }
  const plan = PLANS[business.plan];
  const now = Date.now();
  const expiresAt = business.planExpiresAt;
  const active = !!expiresAt && expiresAt.getTime() > now;
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now) / 86_400_000)) : 0;
  return {
    plan: plan.id,
    isTrial: business.isTrial,
    complimentary: false,
    expiresAt: expiresAt as Date | null,
    active,
    daysLeft,
    endingSoon: active && daysLeft <= WARN_DAYS,
    // Modules of the plan stay visible after expiry (read-only) — the write
    // block is separate, in requireAuth.
    features: featuresOf(plan.id, business.legacyFeaturesUntil ?? null, now),
    maxEmployees: plan.maxEmployees,
    maxLocations: plan.maxLocations,
  };
}

/** The plan's modules, plus what the business had before the split while that grace lasts. */
export function featuresOf(plan: PlanId, legacyFeaturesUntil: Date | null, now = Date.now()): Feature[] {
  const own = PLANS[plan].features;
  if (!legacyFeaturesUntil || legacyFeaturesUntil.getTime() <= now) return own;
  return FEATURES.filter((f) => own.includes(f) || LEGACY_EXTRAS[plan].includes(f));
}

/** Whether a business row (as stored) includes a module right now. */
export function businessHas(
  business: { plan: PlanId; complimentary?: boolean; legacyFeaturesUntil?: Date | null },
  feature: Feature,
) {
  return !!business.complimentary || featuresOf(business.plan, business.legacyFeaturesUntil ?? null).includes(feature);
}

export type SubscriptionInfo = ReturnType<typeof subscriptionInfo>;
