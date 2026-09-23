import { prisma } from "../config/prisma";
import { round2, toNumber } from "../utils/money";
import { resolvePreset } from "../utils/dateRange";
import { DashboardQuery } from "../validators/dashboard.validator";

const WEEKDAYS_KY = ["Жек", "Дүй", "Шей", "Шар", "Бей", "Жума", "Ишм"];

function percentChange(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function previousRange(start: Date, end: Date) {
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return { start: prevStart, end: prevEnd };
}

async function periodTotals(businessId: string, start: Date, end: Date) {
  const [salesAgg, salesCount, expensesAgg, returnsAgg, repairsAgg] = await Promise.all([
    prisma.sale.aggregate({
      where: { businessId, createdAt: { gte: start, lte: end }, status: "COMPLETED" },
      _sum: { total: true, costTotal: true },
    }),
    prisma.sale.count({ where: { businessId, createdAt: { gte: start, lte: end }, status: "COMPLETED" } }),
    prisma.expense.aggregate({
      where: { businessId, createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
    prisma.saleReturn.aggregate({
      where: { businessId, createdAt: { gte: start, lte: end } },
      _sum: { total: true, costTotal: true },
    }),
    prisma.repairOrder.aggregate({
      where: { businessId, status: "DELIVERED", deliveredAt: { gte: start, lte: end } },
      _sum: { finalPrice: true },
    }),
  ]);

  // Net of returns; repair income counts towards profit.
  const revenue = round2(toNumber(salesAgg._sum.total) - toNumber(returnsAgg._sum.total));
  const cost = round2(toNumber(salesAgg._sum.costTotal) - toNumber(returnsAgg._sum.costTotal));
  const expenses = toNumber(expensesAgg._sum.amount);
  const grossProfit = round2(revenue - cost);
  const netProfit = round2(grossProfit + toNumber(repairsAgg._sum.finalPrice) - expenses);

  return { revenue, salesCount, expenses, grossProfit, netProfit };
}

export async function getDashboard(businessId: string, query: DashboardQuery) {
  const { start, end } = resolvePreset(query.range);
  const { start: prevStart, end: prevEnd } = previousRange(start, end);

  const [current, previous, stockAgg, debtAgg] = await Promise.all([
    periodTotals(businessId, start, end),
    periodTotals(businessId, prevStart, prevEnd),
    prisma.product.aggregate({ where: { businessId, status: "ACTIVE" }, _sum: { quantity: true } }),
    prisma.debt.aggregate({
      where: { businessId, status: { in: ["OPEN", "PARTIAL"] } },
      _sum: { remainingAmount: true },
    }),
  ]);

  const avgCheck = current.salesCount > 0 ? round2(current.revenue / current.salesCount) : 0;
  const prevAvgCheck = previous.salesCount > 0 ? round2(previous.revenue / previous.salesCount) : 0;

  return {
    range: query.range,
    kpi: {
      revenue: { value: current.revenue, changePercent: percentChange(current.revenue, previous.revenue) },
      netProfit: { value: current.netProfit, changePercent: percentChange(current.netProfit, previous.netProfit) },
      salesCount: { value: current.salesCount, changePercent: percentChange(current.salesCount, previous.salesCount) },
      avgCheck: { value: avgCheck, changePercent: percentChange(avgCheck, prevAvgCheck) },
      stockQuantity: { value: round2(toNumber(stockAgg._sum.quantity)) },
      totalDebt: { value: round2(toNumber(debtAgg._sum.remainingAmount)) },
    },
  };
}

export async function getSalesDynamics(businessId: string, days = 7) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const sales = await prisma.sale.findMany({
    where: { businessId, createdAt: { gte: start, lte: end }, status: "COMPLETED" },
    select: { total: true, createdAt: true },
  });
  const expenses = await prisma.expense.findMany({
    where: { businessId, createdAt: { gte: start, lte: end } },
    select: { amount: true, createdAt: true },
  });

  const buckets: { date: string; label: string; sales: number; expenses: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    buckets.push({ date: d.toISOString().slice(0, 10), label: WEEKDAYS_KY[d.getDay()], sales: 0, expenses: 0 });
  }

  const indexByDate = new Map(buckets.map((b, i) => [b.date, i]));
  for (const sale of sales) {
    const key = sale.createdAt.toISOString().slice(0, 10);
    const idx = indexByDate.get(key);
    if (idx !== undefined) buckets[idx].sales = round2(buckets[idx].sales + toNumber(sale.total));
  }
  for (const expense of expenses) {
    const key = expense.createdAt.toISOString().slice(0, 10);
    const idx = indexByDate.get(key);
    if (idx !== undefined) buckets[idx].expenses = round2(buckets[idx].expenses + toNumber(expense.amount));
  }

  return buckets;
}

export async function getTopProducts(businessId: string, query: DashboardQuery, limit = 5) {
  const { start, end } = resolvePreset(query.range);

  const items = await prisma.saleItem.groupBy({
    by: ["productId"],
    where: { sale: { businessId, createdAt: { gte: start, lte: end }, status: "COMPLETED" } },
    _sum: { quantity: true, total: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    include: { category: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  return items.map((i) => ({
    productId: i.productId,
    name: productMap.get(i.productId)?.name ?? "—",
    categoryName: productMap.get(i.productId)?.category?.name ?? null,
    soldQuantity: toNumber(i._sum.quantity),
    revenue: toNumber(i._sum.total),
  }));
}

export async function getLowStock(businessId: string, limit = 8) {
  const products = await prisma.product.findMany({
    where: { businessId, status: "ACTIVE" },
    orderBy: { quantity: "asc" },
  });

  return products
    .filter((p) => toNumber(p.quantity) <= toNumber(p.minQuantity))
    .slice(0, limit)
    .map((p) => ({
      id: p.id,
      name: p.name,
      quantity: toNumber(p.quantity),
      minQuantity: toNumber(p.minQuantity),
      unit: p.unit,
      status: toNumber(p.quantity) <= 0 ? "OUT" : "LOW",
    }));
}

/**
 * "Needs attention" panel: expiring batches, repairs waiting for pickup,
 * the viewer's open shift. Only includes what the business has switched on.
 */
export async function getAlerts(businessId: string, employeeId: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [expiring, readyRepairs, activeRepairs, openShift, lowStock] = await Promise.all([
    business.trackExpiry
      ? prisma.productBatch.findMany({
          where: { businessId, quantity: { gt: 0 }, expiryDate: { not: null, lte: soon }, product: { status: "ACTIVE" } },
          include: { product: true },
          orderBy: { expiryDate: "asc" },
          take: 8,
        })
      : Promise.resolve([]),
    business.enableRepairs ? prisma.repairOrder.count({ where: { businessId, status: "READY" } }) : Promise.resolve(0),
    business.enableRepairs
      ? prisma.repairOrder.count({ where: { businessId, status: { in: ["RECEIVED", "IN_PROGRESS"] } } })
      : Promise.resolve(0),
    prisma.cashShift.findFirst({ where: { businessId, employeeId, status: "OPEN" } }),
    getLowStock(businessId, 100),
  ]);

  const expiredCount = business.trackExpiry
    ? await prisma.productBatch.count({ where: { businessId, quantity: { gt: 0 }, expiryDate: { lt: today } } })
    : 0;

  return {
    modules: {
      trackExpiry: business.trackExpiry,
      enableRepairs: business.enableRepairs,
      requireShift: business.requireShift,
    },
    expiringBatches: expiring.map((b) => ({
      id: b.id,
      productName: b.product.name,
      unit: b.product.unit,
      quantity: toNumber(b.quantity),
      expiryDate: b.expiryDate,
      daysLeft: b.expiryDate ? Math.ceil((b.expiryDate.getTime() - today.getTime()) / 86_400_000) : null,
    })),
    expiredCount,
    readyRepairs,
    activeRepairs,
    openShift: openShift ? { id: openShift.id, openedAt: openShift.openedAt } : null,
    lowStockCount: lowStock.length,
  };
}
