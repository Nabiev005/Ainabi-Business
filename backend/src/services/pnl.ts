import { Prisma } from "@prisma/client";
import { round2, toNumber } from "../utils/money";
import { dayKey } from "../utils/dateRange";

/**
 * Profit-and-loss math — no database here, so it can be unit-tested.
 * Net profit = sales − returns − cost of goods + repairs − expenses
 *              − written-off stock − inventory shortages + inventory surplus.
 */

type Numeric = Prisma.Decimal | number | string | null;

export interface PnlRaw {
  sales: { total: Numeric; costTotal: Numeric; discount: Numeric; createdAt: Date }[];
  returns: { total: Numeric; costTotal: Numeric; createdAt: Date }[];
  expenses: { amount: Numeric; category: string; createdAt: Date }[];
  repairs: { finalPrice: Numeric; deliveredAt: Date | null }[];
  writeOffs: { quantity: Numeric; createdAt: Date; product: { purchasePrice: Numeric } }[];
  counts: { shortageValue: Numeric; surplusValue: Numeric; createdAt: Date }[];
}

export function summarize({ sales, returns, expenses, repairs, writeOffs, counts }: PnlRaw) {
  const grossSales = sales.reduce((s, x) => s + toNumber(x.total), 0);
  const returnsTotal = returns.reduce((s, x) => s + toNumber(x.total), 0);
  const cogs = sales.reduce((s, x) => s + toNumber(x.costTotal), 0) - returns.reduce((s, x) => s + toNumber(x.costTotal), 0);
  const revenue = grossSales - returnsTotal;
  const grossProfit = revenue - cogs;
  const repairRevenue = repairs.reduce((s, x) => s + toNumber(x.finalPrice), 0);
  const expensesTotal = expenses.reduce((s, x) => s + toNumber(x.amount), 0);
  const writeOffLoss = writeOffs.reduce((s, x) => s + toNumber(x.quantity) * toNumber(x.product.purchasePrice), 0);
  const shortageLoss = counts.reduce((s, x) => s + toNumber(x.shortageValue), 0);
  const surplusGain = counts.reduce((s, x) => s + toNumber(x.surplusValue), 0);
  const stockLosses = writeOffLoss + shortageLoss - surplusGain;
  const netProfit = grossProfit + repairRevenue - expensesTotal - stockLosses;

  const expensesByCategory = new Map<string, number>();
  for (const e of expenses) expensesByCategory.set(e.category, (expensesByCategory.get(e.category) ?? 0) + toNumber(e.amount));

  return {
    statement: {
      grossSales: round2(grossSales),
      returns: round2(returnsTotal),
      discounts: round2(sales.reduce((s, x) => s + toNumber(x.discount), 0)),
      revenue: round2(revenue),
      cogs: round2(cogs),
      grossProfit: round2(grossProfit),
      repairRevenue: round2(repairRevenue),
      expenses: round2(expensesTotal),
      writeOffLoss: round2(writeOffLoss),
      shortageLoss: round2(shortageLoss),
      surplusGain: round2(surplusGain),
      stockLosses: round2(stockLosses),
      netProfit: round2(netProfit),
      salesCount: sales.length,
      avgCheck: sales.length > 0 ? round2(revenue / sales.length) : 0,
      marginPercent: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
    },
    expensesByCategory: [...expensesByCategory.entries()]
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
  };
}

/** Revenue, expenses and profit per calendar day, every day of the range present. */
export function dailySeries(raw: PnlRaw, start: Date, end: Date) {
  const days = new Map<string, { revenue: number; cost: number; expenses: number; other: number }>();
  const day = (d: Date) => {
    const key = dayKey(d);
    let entry = days.get(key);
    if (!entry) days.set(key, (entry = { revenue: 0, cost: 0, expenses: 0, other: 0 }));
    return entry;
  };
  for (let d = new Date(start); d <= end && days.size < 400; d.setDate(d.getDate() + 1)) day(d);
  for (const x of raw.sales) {
    day(x.createdAt).revenue += toNumber(x.total);
    day(x.createdAt).cost += toNumber(x.costTotal);
  }
  for (const x of raw.returns) {
    day(x.createdAt).revenue -= toNumber(x.total);
    day(x.createdAt).cost -= toNumber(x.costTotal);
  }
  for (const x of raw.expenses) day(x.createdAt).expenses += toNumber(x.amount);
  for (const x of raw.repairs) if (x.deliveredAt) day(x.deliveredAt).other += toNumber(x.finalPrice);
  for (const x of raw.writeOffs) day(x.createdAt).other -= toNumber(x.quantity) * toNumber(x.product.purchasePrice);
  for (const x of raw.counts) day(x.createdAt).other -= toNumber(x.shortageValue) - toNumber(x.surplusValue);
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({
      date,
      revenue: round2(v.revenue),
      expenses: round2(v.expenses),
      profit: round2(v.revenue - v.cost + v.other - v.expenses),
    }));
}
