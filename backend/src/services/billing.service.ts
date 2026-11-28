import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { toNumber } from "../utils/money";
import { PLANS, PlanId, PLAN_IDS, subscriptionInfo, trialEndsAt } from "../config/plans";

/** The billing page: current subscription, the plans, how to pay, past payments. */
export async function getBilling(businessId: string) {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { id: true, name: true, plan: true, planExpiresAt: true, isTrial: true, complimentary: true },
  });
  const [payments, employees, locations] = await Promise.all([
    prisma.subscriptionPayment.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 24 }),
    prisma.employee.count({ where: { businessId, status: "ACTIVE", role: { not: "OWNER" } } }),
    prisma.location.count({ where: { businessId, archived: false } }),
  ]);
  return {
    businessId: business.id,
    businessName: business.name,
    subscription: subscriptionInfo(business),
    usage: { employees, locations: Math.max(1, locations) },
    plans: PLAN_IDS.map((id) => PLANS[id]),
    paymentInfo: env.platformPaymentInfo || null,
    paymentQr: env.platformPaymentQr || null,
    supportWhatsapp: env.platformSupportWhatsapp,
    payments: payments.map((p) => ({
      id: p.id,
      plan: p.plan,
      months: p.months,
      amount: toNumber(p.amount),
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      createdAt: p.createdAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Platform admin — every business on the platform

/** Recent payments across all businesses, plus what came in this month. */
export async function listAllPayments() {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const [payments, month, total] = await Promise.all([
    prisma.subscriptionPayment.findMany({
      include: { business: { select: { name: true, owner: { select: { email: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.subscriptionPayment.aggregate({ where: { createdAt: { gte: startOfMonth } }, _sum: { amount: true }, _count: true }),
    prisma.subscriptionPayment.aggregate({ _sum: { amount: true } }),
  ]);
  return {
    thisMonth: { amount: toNumber(month._sum.amount), count: month._count },
    allTime: toNumber(total._sum.amount),
    payments: payments.map((p) => ({
      id: p.id,
      businessId: p.businessId,
      businessName: p.business.name,
      ownerEmail: p.business.owner.email,
      plan: p.plan,
      months: p.months,
      amount: toNumber(p.amount),
      note: p.note,
      periodEnd: p.periodEnd,
      createdAt: p.createdAt,
    })),
  };
}
// ---------------------------------------------------------------------------

export async function listAllBusinesses(search?: string) {
  const q = search?.trim();
  const businesses = await prisma.business.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { id: q },
            { owner: { email: { contains: q, mode: "insensitive" } } },
            { phone: { contains: q } },
          ],
        }
      : {},
    include: {
      owner: { select: { name: true, email: true, phone: true, emailVerifiedAt: true } },
      _count: { select: { employees: true, sales: true, products: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const lastSales = await prisma.sale.groupBy({
    by: ["businessId"],
    where: { businessId: { in: businesses.map((b) => b.id) } },
    _max: { createdAt: true },
  });
  const lastSaleBy = new Map(lastSales.map((s) => [s.businessId, s._max.createdAt]));
  const ids = businesses.map((b) => b.id);
  const [week, month] = await Promise.all([salesSince(ids, 7), salesSince(ids, 30)]);

  return businesses.map((b) => ({
    id: b.id,
    name: b.name,
    phone: b.phone,
    ownerName: b.owner.name,
    ownerEmail: b.owner.email,
    ownerPhone: b.owner.phone,
    createdAt: b.createdAt,
    employees: b._count.employees,
    sales: b._count.sales,
    products: b._count.products,
    lastSaleAt: lastSaleBy.get(b.id) ?? null,
    sales7d: week.get(b.id) ?? 0,
    sales30d: month.get(b.id) ?? 0,
    health: healthOf(b.createdAt, lastSaleBy.get(b.id) ?? null),
    ownerVerified: !!b.owner.emailVerifiedAt,
    subscription: subscriptionInfo(b),
  }));
}

/** Receipts per business over the last `days` days. */
async function salesSince(businessIds: string[], days: number) {
  const rows = await prisma.sale.groupBy({
    by: ["businessId"],
    where: { businessId: { in: businessIds }, createdAt: { gte: new Date(Date.now() - days * 86_400_000) } },
    _count: true,
  });
  return new Map(rows.map((r) => [r.businessId, r._count]));
}

export type Health = "NEW" | "ACTIVE" | "SLOWING" | "INACTIVE";

/** Is the shop actually using the system? Judged by its last sale. */
export function healthOf(createdAt: Date, lastSaleAt: Date | null, now = Date.now()): Health {
  const ageDays = (now - createdAt.getTime()) / 86_400_000;
  if (!lastSaleAt) return ageDays < 3 ? "NEW" : "INACTIVE";
  const idle = (now - lastSaleAt.getTime()) / 86_400_000;
  if (idle <= 7) return "ACTIVE";
  return idle <= 14 ? "SLOWING" : "INACTIVE";
}

/**
 * The owner's dashboard: how many shops, how many pay, monthly revenue, who
 * is about to run out, and who stopped using the system — the people to call.
 */
export async function platformOverview() {
  const all = await listAllBusinesses();
  const now = Date.now();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const sixMonthsAgo = new Date(startOfMonth);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

  const payments = await prisma.subscriptionPayment.findMany({ where: { createdAt: { gte: sixMonthsAgo } }, select: { amount: true, createdAt: true } });
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(sixMonthsAgo);
    d.setMonth(d.getMonth() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const revenueByMonth = new Map(months.map((m) => [m, 0]));
  for (const p of payments) {
    const key = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, "0")}`;
    if (revenueByMonth.has(key)) revenueByMonth.set(key, revenueByMonth.get(key)! + toNumber(p.amount));
  }

  const paying = all.filter((b) => b.subscription.active && !b.subscription.isTrial && !b.subscription.complimentary);
  const trials = all.filter((b) => b.subscription.active && b.subscription.isTrial && !b.subscription.complimentary);
  const pick = (b: (typeof all)[number]) => ({
    id: b.id,
    name: b.name,
    ownerName: b.ownerName,
    phone: b.ownerPhone ?? b.phone,
    plan: b.subscription.plan,
    isTrial: b.subscription.isTrial,
    expiresAt: b.subscription.expiresAt,
    daysLeft: b.subscription.daysLeft,
    lastSaleAt: b.lastSaleAt,
    sales30d: b.sales30d,
  });

  return {
    totals: {
      businesses: all.length,
      paying: paying.length,
      trials: trials.length,
      complimentary: all.filter((b) => b.subscription.complimentary).length,
      expired: all.filter((b) => !b.subscription.active).length,
      newLast30Days: all.filter((b) => now - new Date(b.createdAt).getTime() < 30 * 86_400_000).length,
      activeLast7Days: all.filter((b) => b.health === "ACTIVE").length,
    },
    // What the paying shops bring in a month at list price.
    mrr: paying.reduce((s, b) => s + PLANS[b.subscription.plan].priceMonthly, 0),
    revenueByMonth: months.map((month) => ({ month, amount: Math.round(revenueByMonth.get(month)! * 100) / 100 })),
    expiringSoon: all
      .filter((b) => b.subscription.active && !b.subscription.complimentary && b.subscription.daysLeft <= 7)
      .sort((a, b) => a.subscription.daysLeft - b.subscription.daysLeft)
      .map(pick),
    // Paying or trying, but not selling any more.
    atRisk: all
      .filter((b) => b.subscription.active && (b.health === "SLOWING" || b.health === "INACTIVE"))
      .sort((a, b) => (a.lastSaleAt ? new Date(a.lastSaleAt).getTime() : 0) - (b.lastSaleAt ? new Date(b.lastSaleAt).getTime() : 0))
      .map(pick),
    mostActive: [...all].filter((b) => b.sales30d > 0).sort((a, b) => b.sales30d - a.sales30d).slice(0, 10).map(pick),
  };
}

/**
 * Records a payment and extends the subscription by `months` — from today
 * if it had already run out, otherwise from the current end date (paying
 * early never loses days). `months = 0` only switches the plan.
 */
export async function recordPayment(
  recordedById: string,
  businessId: string,
  input: { plan: PlanId; months: number; amount: number; note?: string | null; days?: number },
) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw ApiError.notFound("Бизнес табылган жок.");
  // The free trial covers Basic and Pro only: Max needs a paid period.
  if (input.plan === "MAX" && input.months === 0 && (business.isTrial || !business.planExpiresAt || business.planExpiresAt <= new Date() || business.plan !== "MAX")) {
    throw ApiError.badRequest("Макс тарифи бекер сыноого кирбейт — аны төлөм менен гана (кеминде 1 ай) ачууга болот.");
  }

  const now = new Date();
  const base = business.planExpiresAt && business.planExpiresAt > now ? business.planExpiresAt : now;
  const end = new Date(base);
  end.setMonth(end.getMonth() + input.months);
  if (input.days) end.setDate(end.getDate() + input.days);
  const extends_ = input.months > 0 || !!input.days;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.business.update({
      where: { id: businessId },
      data: {
        plan: input.plan,
        ...(extends_ ? { planExpiresAt: end } : {}),
        // A real payment ends the trial; a goodwill extension (days, no money) keeps the flag as is.
        // It also starts the new plan rules: what the business kept from before the split ends here.
        ...(input.months > 0 ? { isTrial: false, legacyFeaturesUntil: null } : {}),
      },
    });
    if (input.months > 0 || input.amount > 0) {
      await tx.subscriptionPayment.create({
        data: {
          businessId,
          plan: input.plan,
          months: input.months,
          amount: input.amount,
          note: input.note || null,
          periodStart: base,
          periodEnd: updated.planExpiresAt ?? end,
          recordedById,
        },
      });
    }
    return subscriptionInfo(updated);
  });
}

/**
 * Stops a business right away (e.g. the month wasn't paid): its subscription
 * ends now, so it drops to read-only exactly as if it had run out — data
 * stays, nothing can be changed. A payment recorded later turns it back on.
 */
export async function blockBusiness(businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw ApiError.notFound("Бизнес табылган жок.");
  const updated = await prisma.business.update({ where: { id: businessId }, data: { planExpiresAt: new Date(Date.now() - 1000) } });
  return subscriptionInfo(updated);
}

/** Platform admin: make a business free for good (or take that back). */
export async function setComplimentary(businessId: string, complimentary: boolean) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) throw ApiError.notFound("Бизнес табылган жок.");
  const updated = await prisma.business.update({
    where: { id: businessId },
    // Taking it back leaves a fresh 14-day window to arrange payment.
    data: complimentary ? { complimentary: true, isTrial: false } : { complimentary: false, planExpiresAt: trialEndsAt() },
  });
  return subscriptionInfo(updated);
}
