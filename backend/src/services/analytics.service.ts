import { prisma } from "../config/prisma";
import { round2, toNumber } from "../utils/money";
import { resolvePreset } from "../utils/dateRange";
import { ReportQuery } from "../validators/report.validator";

/**
 * Owner's statistics page: a full profit-and-loss statement for the period
 * (including stock losses — write-offs and inventory shortages, which the
 * plain sales report doesn't count), how it compares with the previous
 * period of the same length, and what each employee did.
 */

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

async function profitAndLoss(businessId: string, start: Date, end: Date) {
  const range = { gte: start, lte: end };
  const [sales, returns, expenses, repairs, writeOffs, counts] = await Promise.all([
    prisma.sale.findMany({
      where: { businessId, createdAt: range, status: "COMPLETED" },
      select: { total: true, costTotal: true, discount: true, createdAt: true, employeeId: true },
    }),
    prisma.saleReturn.findMany({
      where: { businessId, createdAt: range },
      select: { total: true, costTotal: true, createdAt: true, employeeId: true, sale: { select: { employeeId: true } } },
    }),
    prisma.expense.findMany({ where: { businessId, createdAt: range }, select: { amount: true, category: true, createdAt: true } }),
    prisma.repairOrder.findMany({
      where: { businessId, status: "DELIVERED", deliveredAt: range },
      select: { finalPrice: true, deliveredAt: true, employeeId: true },
    }),
    prisma.stockMovement.findMany({
      where: { businessId, type: "WRITE_OFF", createdAt: range },
      select: { quantity: true, createdAt: true, product: { select: { purchasePrice: true } } },
    }),
    prisma.inventoryCount.findMany({
      where: { businessId, createdAt: range },
      select: { shortageValue: true, surplusValue: true, createdAt: true },
    }),
  ]);

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
    raw: { sales, returns, expenses, repairs, writeOffs, counts },
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

export async function buildAnalytics(businessId: string, query: ReportQuery) {
  const { start, end } = resolvePreset(query.preset === "custom" ? undefined : query.preset, query.from, query.to);
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  const [current, previous] = await Promise.all([profitAndLoss(businessId, start, end), profitAndLoss(businessId, prevStart, prevEnd)]);
  const s = current.statement;
  const p = previous.statement;

  // ---- daily series: revenue, expenses and profit per day ----
  const days = new Map<string, { revenue: number; cost: number; expenses: number; other: number }>();
  const day = (d: Date) => {
    const key = dayKey(d);
    let entry = days.get(key);
    if (!entry) days.set(key, (entry = { revenue: 0, cost: 0, expenses: 0, other: 0 }));
    return entry;
  };
  for (let d = new Date(start); d <= end && days.size < 400; d.setDate(d.getDate() + 1)) day(d);
  const { raw } = current;
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
  const series = [...days.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({
      date,
      revenue: round2(v.revenue),
      expenses: round2(v.expenses),
      profit: round2(v.revenue - v.cost + v.other - v.expenses),
    }));

  // ---- team ----
  const range = { gte: start, lte: end };
  const [employees, receipts, stageMoves, tasksDone, openTasks, shifts] = await Promise.all([
    prisma.employee.findMany({ where: { businessId }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.purchaseReceipt.groupBy({ by: ["employeeId"], where: { businessId, createdAt: range }, _count: true, _sum: { total: true } }),
    prisma.productStageEvent.groupBy({ by: ["employeeId"], where: { businessId, createdAt: range }, _count: true }),
    prisma.task.groupBy({ by: ["assigneeId"], where: { businessId, status: "DONE", completedAt: range }, _count: true }),
    prisma.task.findMany({ where: { businessId, status: { in: ["TODO", "IN_PROGRESS"] } }, select: { assigneeId: true, dueDate: true } }),
    prisma.cashShift.findMany({ where: { businessId, status: "CLOSED", closedAt: range }, select: { employeeId: true, difference: true } }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const team = employees.map((e) => {
    const mySales = raw.sales.filter((x) => x.employeeId === e.id);
    const returnsOnMySales = raw.returns.filter((x) => x.sale.employeeId === e.id);
    const revenue = mySales.reduce((acc, x) => acc + toNumber(x.total), 0) - returnsOnMySales.reduce((acc, x) => acc + toNumber(x.total), 0);
    const cost = mySales.reduce((acc, x) => acc + toNumber(x.costTotal), 0) - returnsOnMySales.reduce((acc, x) => acc + toNumber(x.costTotal), 0);
    const myOpen = openTasks.filter((t) => t.assigneeId === e.id);
    const myShifts = shifts.filter((x) => x.employeeId === e.id);
    const receipt = receipts.find((r) => r.employeeId === e.id);
    return {
      employeeId: e.id,
      name: e.user.name,
      role: e.role,
      status: e.status,
      lastLoginAt: e.lastLoginAt,
      salesCount: mySales.length,
      revenue: round2(revenue),
      profit: round2(revenue - cost),
      discounts: round2(mySales.reduce((acc, x) => acc + toNumber(x.discount), 0)),
      returnsProcessed: raw.returns.filter((x) => x.employeeId === e.id).length,
      repairsDelivered: raw.repairs.filter((x) => x.employeeId === e.id).length,
      receiptsCount: receipt?._count ?? 0,
      receiptsTotal: round2(toNumber(receipt?._sum.total)),
      stageMoves: stageMoves.find((m) => m.employeeId === e.id)?._count ?? 0,
      tasksDone: tasksDone.find((t) => t.assigneeId === e.id)?._count ?? 0,
      tasksOpen: myOpen.length,
      tasksOverdue: myOpen.filter((t) => t.dueDate && t.dueDate < today).length,
      shiftsClosed: myShifts.length,
      // Negative = the drawer was short at closing.
      cashDifference: round2(myShifts.reduce((acc, x) => acc + toNumber(x.difference), 0)),
    };
  });

  return {
    range: { from: start.toISOString(), to: end.toISOString() },
    statement: s,
    previous: p,
    changes: {
      revenue: percentChange(s.revenue, p.revenue),
      grossProfit: percentChange(s.grossProfit, p.grossProfit),
      expenses: percentChange(s.expenses, p.expenses),
      netProfit: percentChange(s.netProfit, p.netProfit),
      salesCount: percentChange(s.salesCount, p.salesCount),
    },
    expensesByCategory: current.expensesByCategory,
    series,
    team,
    tasks: {
      open: openTasks.length,
      overdue: openTasks.filter((t) => t.dueDate && t.dueDate < today).length,
      doneInPeriod: tasksDone.reduce((acc, t) => acc + t._count, 0),
    },
  };
}
