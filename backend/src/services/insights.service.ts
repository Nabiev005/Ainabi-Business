import { prisma } from "../config/prisma";
import { round2, toNumber } from "../utils/money";
import { profitAndLoss } from "./analytics.service";

/**
 * Plain-rule business advice: the month in numbers plus concrete things to
 * do next month (what's tying up cash, what to reorder, what's barely
 * profitable, who gives away too much discount…). No AI, nothing leaves the
 * database — every hint says exactly which numbers it's based on.
 *
 * Hints carry data, not text: the frontend words them in the user's language.
 */

const STALE_DAYS = 60;
const REORDER_LOOKBACK_DAYS = 30;
const REORDER_WITHIN_DAYS = 7;
const LOW_MARGIN_PERCENT = 8;
const OVERDUE_DEBT_DAYS = 30;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Slow movers — shared by the monthly report and the "slow stock" page
// ---------------------------------------------------------------------------

/**
 * Products with stock that haven't sold for `days` days (counting from their
 * last sale, or — never sold — from the last time stock came in).
 */
export async function getStaleProducts(businessId: string, days = STALE_DAYS) {
  const cutoff = new Date(Date.now() - days * DAY_MS);
  const products = await prisma.product.findMany({
    where: { businessId, status: "ACTIVE", quantity: { gt: 0 }, createdAt: { lt: cutoff } },
    include: { category: { select: { name: true } } },
  });
  if (products.length === 0) return [];

  const ids = products.map((p) => p.id);
  const [lastSales, lastIns] = await Promise.all([
    prisma.stockMovement.groupBy({ by: ["productId"], where: { businessId, productId: { in: ids }, type: "SALE" }, _max: { createdAt: true } }),
    prisma.stockMovement.groupBy({ by: ["productId"], where: { businessId, productId: { in: ids }, type: "IN" }, _max: { createdAt: true } }),
  ]);
  const lastSale = new Map(lastSales.map((m) => [m.productId, m._max.createdAt]));
  const lastIn = new Map(lastIns.map((m) => [m.productId, m._max.createdAt]));

  const now = Date.now();
  return products
    .map((p) => {
      const sold = lastSale.get(p.id) ?? null;
      const since = sold ?? lastIn.get(p.id) ?? p.createdAt;
      const quantity = toNumber(p.quantity);
      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        categoryName: p.category?.name ?? null,
        quantity,
        unit: p.unit,
        salePrice: toNumber(p.salePrice),
        purchasePrice: toNumber(p.purchasePrice),
        frozenValue: round2(quantity * toNumber(p.purchasePrice)),
        lastSoldAt: sold,
        idleDays: Math.floor((now - since.getTime()) / DAY_MS),
      };
    })
    .filter((p) => p.idleDays >= days)
    .sort((a, b) => b.frozenValue - a.frozenValue);
}

// ---------------------------------------------------------------------------
// Monthly report
// ---------------------------------------------------------------------------

function monthRange(month?: string) {
  // Default: the month that just ended.
  const now = new Date();
  let year = now.getFullYear();
  let m = now.getMonth() - 1;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    year = Number(month.slice(0, 4));
    m = Number(month.slice(5, 7)) - 1;
  }
  const start = new Date(year, m, 1);
  const end = new Date(year, m + 1, 0, 23, 59, 59, 999);
  const prevStart = new Date(year, m - 1, 1);
  const prevEnd = new Date(year, m, 0, 23, 59, 59, 999);
  const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  return { start, end, prevStart, prevEnd, key };
}

const pct = (current: number, previous: number) => (previous === 0 ? null : Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10);

export type Insight =
  | { type: "stale"; severity: "warning"; count: number; frozenValue: number; items: { name: string; idleDays: number; quantity: number }[] }
  | { type: "reorder"; severity: "danger"; items: { name: string; perMonth: number; left: number; daysLeft: number }[] }
  | { type: "lowMargin"; severity: "warning"; items: { name: string; marginPercent: number; sold: number }[] }
  | { type: "topProfit"; severity: "success"; name: string; sharePercent: number; profit: number }
  | { type: "discounts"; severity: "warning"; name: string; amount: number; timesAverage: number }
  | { type: "bestDays"; severity: "info"; days: number[]; sharePercent: number }
  | { type: "overdueDebts"; severity: "danger"; count: number; amount: number }
  | { type: "expenses"; severity: "warning"; expensesChange: number; revenueChange: number | null; topCategory: string | null }
  | { type: "returns"; severity: "warning"; ratePercent: number; amount: number; items: { name: string; count: number }[]; reasons: string[] };

export async function buildMonthlyInsights(businessId: string, opts: { month?: string; includeStale: boolean }) {
  const { start, end, prevStart, prevEnd, key } = monthRange(opts.month);
  const range = { gte: start, lte: end };

  const [current, previous] = await Promise.all([profitAndLoss(businessId, start, end), profitAndLoss(businessId, prevStart, prevEnd)]);
  const s = current.statement;
  const p = previous.statement;
  const insights: Insight[] = [];

  // --- per-product sales in the month ---
  const items = await prisma.saleItem.findMany({
    where: { sale: { businessId, createdAt: range, status: "COMPLETED" } },
    select: { productId: true, quantity: true, total: true, costPrice: true, returnedQuantity: true, product: { select: { name: true } } },
  });
  const byProduct = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();
  for (const i of items) {
    const net = toNumber(i.quantity) - toNumber(i.returnedQuantity);
    const share = toNumber(i.quantity) > 0 ? net / toNumber(i.quantity) : 0;
    const e = byProduct.get(i.productId) ?? { name: i.product.name, qty: 0, revenue: 0, cost: 0 };
    e.qty += net;
    e.revenue += toNumber(i.total) * share;
    e.cost += toNumber(i.costPrice) * net;
    byProduct.set(i.productId, e);
  }
  const productRows = [...byProduct.values()].filter((r) => r.qty > 0);
  const grossFromProducts = productRows.reduce((acc, r) => acc + (r.revenue - r.cost), 0);

  // 🔥 fast sellers about to run out (last 30 days of sales vs stock now)
  const since = new Date(Date.now() - REORDER_LOOKBACK_DAYS * DAY_MS);
  const [soldRecently, returnedRecently] = await Promise.all([
    prisma.stockMovement.groupBy({ by: ["productId"], where: { businessId, type: "SALE", createdAt: { gte: since } }, _sum: { quantity: true } }),
    prisma.stockMovement.groupBy({ by: ["productId"], where: { businessId, type: "RETURN", createdAt: { gte: since } }, _sum: { quantity: true } }),
  ]);
  const returnedMap = new Map(returnedRecently.map((r) => [r.productId, toNumber(r._sum.quantity)]));
  const velocity = soldRecently
    .map((r) => ({ productId: r.productId, perMonth: toNumber(r._sum.quantity) - (returnedMap.get(r.productId) ?? 0) }))
    .filter((r) => r.perMonth > 0);
  if (velocity.length > 0) {
    const stock = await prisma.product.findMany({
      where: { businessId, status: "ACTIVE", id: { in: velocity.map((v) => v.productId) } },
      select: { id: true, name: true, quantity: true },
    });
    const reorder = stock
      .map((prod) => {
        const v = velocity.find((x) => x.productId === prod.id)!;
        const left = toNumber(prod.quantity);
        const daysLeft = Math.floor(left / (v.perMonth / REORDER_LOOKBACK_DAYS));
        return { name: prod.name, perMonth: round2(v.perMonth), left, daysLeft };
      })
      .filter((r) => r.daysLeft <= REORDER_WITHIN_DAYS)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);
    if (reorder.length > 0) insights.push({ type: "reorder", severity: "danger", items: reorder });
  }

  // 🧊 cash tied up in slow stock — owner only
  if (opts.includeStale) {
    const stale = await getStaleProducts(businessId);
    if (stale.length > 0) {
      insights.push({
        type: "stale",
        severity: "warning",
        count: stale.length,
        frozenValue: round2(stale.reduce((acc, x) => acc + x.frozenValue, 0)),
        items: stale.slice(0, 5).map((x) => ({ name: x.name, idleDays: x.idleDays, quantity: x.quantity })),
      });
    }
  }

  // 💸 barely profitable products (only ones that sold for real money)
  const lowMargin = productRows
    .filter((r) => r.revenue > 0 && r.revenue >= s.revenue * 0.01)
    .map((r) => ({ name: r.name, marginPercent: Math.round(((r.revenue - r.cost) / r.revenue) * 1000) / 10, sold: round2(r.qty) }))
    .filter((r) => r.marginPercent < LOW_MARGIN_PERCENT)
    .sort((a, b) => a.marginPercent - b.marginPercent)
    .slice(0, 3);
  if (lowMargin.length > 0) insights.push({ type: "lowMargin", severity: "warning", items: lowMargin });

  // 🏆 the product that earned most
  const top = productRows.sort((a, b) => b.revenue - b.cost - (a.revenue - a.cost))[0];
  if (top && grossFromProducts > 0 && top.revenue - top.cost > 0) {
    insights.push({
      type: "topProfit",
      severity: "success",
      name: top.name,
      profit: round2(top.revenue - top.cost),
      sharePercent: Math.round(((top.revenue - top.cost) / grossFromProducts) * 100),
    });
  }

  // 👤 someone giving away much more discount than the rest
  const discountBy = new Map<string, number>();
  for (const sale of current.raw.sales) discountBy.set(sale.employeeId, (discountBy.get(sale.employeeId) ?? 0) + toNumber(sale.discount));
  const givers = [...discountBy.entries()].filter(([, v]) => v > 0);
  if (givers.length >= 2) {
    givers.sort((a, b) => b[1] - a[1]);
    const [topId, topAmount] = givers[0];
    const othersAvg = givers.slice(1).reduce((acc, [, v]) => acc + v, 0) / (givers.length - 1);
    if (othersAvg > 0 && topAmount >= othersAvg * 2) {
      const emp = await prisma.employee.findUnique({ where: { id: topId }, include: { user: { select: { name: true } } } });
      insights.push({
        type: "discounts",
        severity: "warning",
        name: emp?.user.name ?? "—",
        amount: round2(topAmount),
        timesAverage: Math.round((topAmount / othersAvg) * 10) / 10,
      });
    }
  }

  // 📅 which weekdays sell
  if (current.raw.sales.length >= 10) {
    const byDay = new Array(7).fill(0);
    for (const sale of current.raw.sales) byDay[sale.createdAt.getDay()] += toNumber(sale.total);
    const total = byDay.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const ranked = byDay.map((v, d) => ({ d, v })).sort((a, b) => b.v - a.v);
      const best = ranked.slice(0, 2);
      insights.push({
        type: "bestDays",
        severity: "info",
        days: best.map((x) => x.d),
        sharePercent: Math.round((best.reduce((a, x) => a + x.v, 0) / total) * 100),
      });
    }
  }

  // 💰 debts nobody has paid for a month
  const overdue = await prisma.debt.aggregate({
    where: { businessId, status: { in: ["OPEN", "PARTIAL"] }, createdAt: { lt: new Date(Date.now() - OVERDUE_DEBT_DAYS * DAY_MS) } },
    _sum: { remainingAmount: true },
    _count: true,
  });
  if (overdue._count > 0) {
    insights.push({ type: "overdueDebts", severity: "danger", count: overdue._count, amount: round2(toNumber(overdue._sum.remainingAmount)) });
  }

  // 📈 expenses growing faster than revenue
  const expensesChange = pct(s.expenses, p.expenses);
  const revenueChange = pct(s.revenue, p.revenue);
  if (expensesChange !== null && expensesChange > 5 && (revenueChange === null || expensesChange > revenueChange)) {
    const prevByCat = new Map(previous.expensesByCategory.map((e) => [e.category, e.amount]));
    const grew = current.expensesByCategory
      .map((e) => ({ category: e.category, delta: e.amount - (prevByCat.get(e.category) ?? 0) }))
      .sort((a, b) => b.delta - a.delta)[0];
    insights.push({ type: "expenses", severity: "warning", expensesChange, revenueChange, topCategory: grew && grew.delta > 0 ? grew.category : null });
  }

  // ↩️ returns — laptops come back; which models and why
  if (current.raw.returns.length > 0 && s.grossSales > 0) {
    const returnItems = await prisma.saleReturnItem.findMany({
      where: { return: { businessId, createdAt: range } },
      select: { quantity: true, product: { select: { name: true } }, return: { select: { reason: true } } },
    });
    const count = new Map<string, number>();
    const reasons = new Map<string, number>();
    for (const r of returnItems) {
      count.set(r.product.name, (count.get(r.product.name) ?? 0) + toNumber(r.quantity));
      const reason = r.return.reason?.trim();
      if (reason) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    insights.push({
      type: "returns",
      severity: "warning",
      ratePercent: Math.round((s.returns / s.grossSales) * 1000) / 10,
      amount: s.returns,
      items: [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, c]) => ({ name, count: c })),
      reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r),
    });
  }

  const order: Record<Insight["severity"], number> = { danger: 0, warning: 1, success: 2, info: 3 };
  insights.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    month: key,
    summary: {
      revenue: s.revenue,
      netProfit: s.netProfit,
      grossProfit: s.grossProfit,
      expenses: s.expenses,
      salesCount: s.salesCount,
      avgCheck: s.avgCheck,
      revenueChange,
      netProfitChange: pct(s.netProfit, p.netProfit),
    },
    insights,
  };
}

// ---------------------------------------------------------------------------
// Returns journal
// ---------------------------------------------------------------------------

export async function listReturns(businessId: string, query: { from?: string; to?: string; page: number; pageSize: number }) {
  const where = {
    businessId,
    ...(query.from || query.to
      ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(`${query.to}T23:59:59`) } : {}) } }
      : {}),
  };
  const [rows, total, sums] = await Promise.all([
    prisma.saleReturn.findMany({
      where,
      include: {
        sale: { select: { number: true, createdAt: true, customer: { select: { name: true, phone: true } } } },
        employee: { include: { user: { select: { name: true } } } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.saleReturn.count({ where }),
    prisma.saleReturn.aggregate({ where, _sum: { total: true } }),
  ]);
  return {
    summary: { count: total, amount: round2(toNumber(sums._sum.total)) },
    items: rows.map((r) => ({
      id: r.id,
      saleId: r.saleId,
      saleNumber: r.sale.number,
      soldAt: r.sale.createdAt,
      customer: r.sale.customer ? { name: r.sale.customer.name, phone: r.sale.customer.phone } : null,
      total: toNumber(r.total),
      refundMethod: r.refundMethod,
      reason: r.reason,
      employeeName: r.employee.user.name,
      createdAt: r.createdAt,
      items: r.items.map((i) => ({ productName: i.product.name, quantity: toNumber(i.quantity), serialNumbers: i.serialNumbers })),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
