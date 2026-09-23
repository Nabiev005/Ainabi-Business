import { prisma } from "../config/prisma";
import { round2, toNumber } from "../utils/money";
import { resolvePreset } from "../utils/dateRange";
import { ReportQuery } from "../validators/report.validator";

export async function buildReport(businessId: string, query: ReportQuery) {
  const { start, end } = resolvePreset(query.preset === "custom" ? undefined : query.preset, query.from, query.to);

  const [sales, expensesAgg, saleItems, returnsAgg, returnItems, repairsAgg] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId, createdAt: { gte: start, lte: end }, status: "COMPLETED" },
      select: { total: true, costTotal: true, discount: true, createdAt: true },
    }),
    prisma.expense.aggregate({
      where: { businessId, createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
    prisma.saleItem.findMany({
      where: { sale: { businessId, createdAt: { gte: start, lte: end }, status: "COMPLETED" } },
      select: { productId: true, quantity: true, total: true, costPrice: true, product: { select: { name: true } } },
    }),
    // Returns count against the day the goods came back, not the sale day.
    prisma.saleReturn.aggregate({
      where: { businessId, createdAt: { gte: start, lte: end } },
      _sum: { total: true, costTotal: true },
    }),
    prisma.saleReturnItem.findMany({
      where: { return: { businessId, createdAt: { gte: start, lte: end } } },
      select: { productId: true, quantity: true, total: true, costTotal: true, product: { select: { name: true } }, return: { select: { createdAt: true } } },
    }),
    prisma.repairOrder.aggregate({
      where: { businessId, status: "DELIVERED", deliveredAt: { gte: start, lte: end } },
      _sum: { finalPrice: true },
      _count: true,
    }),
  ]);

  const totalReturns = round2(toNumber(returnsAgg._sum.total));
  const totalSales = round2(sales.reduce((sum, s) => sum + toNumber(s.total), 0) - totalReturns);
  const totalCogs = round2(sales.reduce((sum, s) => sum + toNumber(s.costTotal), 0) - toNumber(returnsAgg._sum.costTotal));
  const totalDiscount = round2(sales.reduce((sum, s) => sum + toNumber(s.discount), 0));
  const totalExpenses = round2(toNumber(expensesAgg._sum.amount));
  const repairRevenue = round2(toNumber(repairsAgg._sum.finalPrice));
  const grossProfit = round2(totalSales - totalCogs);
  const netProfit = round2(grossProfit + repairRevenue - totalExpenses);
  const salesCount = sales.length;
  const avgCheck = salesCount > 0 ? round2(totalSales / salesCount) : 0;

  const byProduct = new Map<string, { name: string; quantitySold: number; revenue: number; cost: number }>();
  for (const item of saleItems) {
    const entry = byProduct.get(item.productId) ?? { name: item.product.name, quantitySold: 0, revenue: 0, cost: 0 };
    entry.quantitySold = round2(entry.quantitySold + toNumber(item.quantity));
    entry.revenue = round2(entry.revenue + toNumber(item.total));
    entry.cost = round2(entry.cost + toNumber(item.costPrice) * toNumber(item.quantity));
    byProduct.set(item.productId, entry);
  }
  for (const item of returnItems) {
    const entry = byProduct.get(item.productId) ?? { name: item.product.name, quantitySold: 0, revenue: 0, cost: 0 };
    entry.quantitySold = round2(entry.quantitySold - toNumber(item.quantity));
    entry.revenue = round2(entry.revenue - toNumber(item.total));
    entry.cost = round2(entry.cost - toNumber(item.costTotal));
    byProduct.set(item.productId, entry);
  }

  const productPerformance = Array.from(byProduct.entries())
    .map(([productId, v]) => ({
      productId,
      name: v.name,
      quantitySold: v.quantitySold,
      revenue: v.revenue,
      profit: round2(v.revenue - v.cost),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const bestSelling = [...productPerformance].sort((a, b) => b.quantitySold - a.quantitySold)[0] ?? null;
  const mostProfitable = [...productPerformance].sort((a, b) => b.profit - a.profit)[0] ?? null;

  // Daily series for chart.
  const dayMap = new Map<string, { sales: number; expenses: number }>();
  for (const s of sales) {
    const key = s.createdAt.toISOString().slice(0, 10);
    const entry = dayMap.get(key) ?? { sales: 0, expenses: 0 };
    entry.sales = round2(entry.sales + toNumber(s.total));
    dayMap.set(key, entry);
  }
  const returnsByDay = new Map<string, number>();
  for (const item of returnItems) {
    const key = item.return.createdAt.toISOString().slice(0, 10);
    returnsByDay.set(key, (returnsByDay.get(key) ?? 0) + toNumber(item.total));
  }
  for (const [key, amount] of returnsByDay) {
    const entry = dayMap.get(key) ?? { sales: 0, expenses: 0 };
    entry.sales = round2(entry.sales - amount);
    dayMap.set(key, entry);
  }
  const expenses = await prisma.expense.findMany({ where: { businessId, createdAt: { gte: start, lte: end } } });
  for (const e of expenses) {
    const key = e.createdAt.toISOString().slice(0, 10);
    const entry = dayMap.get(key) ?? { sales: 0, expenses: 0 };
    entry.expenses = round2(entry.expenses + toNumber(e.amount));
    dayMap.set(key, entry);
  }
  const series = Array.from(dayMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, ...v }));

  return {
    range: { from: start.toISOString(), to: end.toISOString() },
    summary: {
      totalSales,
      netProfit,
      grossProfit,
      totalExpenses,
      totalCogs,
      totalDiscount,
      totalReturns,
      repairRevenue,
      repairsCount: repairsAgg._count,
      salesCount,
      avgCheck,
    },
    bestSelling,
    mostProfitable,
    productPerformance,
    series,
  };
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))];
  return lines.join("\n");
}
