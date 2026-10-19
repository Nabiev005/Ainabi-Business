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
      owner: { select: { name: true, email: true, phone: true } },
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
    subscription: subscriptionInfo(b),
  }));
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
        ...(input.months > 0 ? { isTrial: false } : {}),
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
