import { prisma } from "../config/prisma";
import { round2, toNumber } from "../utils/money";
import { resolvePreset } from "../utils/dateRange";
import { dailySeries, summarize } from "./pnl";
import { projectMonth, WEEKDAY_HISTORY_DAYS } from "./forecast";
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

export async function profitAndLoss(businessId: string, start: Date, end: Date) {
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

  const raw = { sales, returns, expenses, repairs, writeOffs, counts };
  return { raw, ...summarize(raw) };
}

/**
 * This calendar month at the current pace vs the owner's revenue plan —
 * always about this month, whatever period the rest of the page shows.
 * The math lives in ./forecast.
 */
async function monthForecast(businessId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const historyStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - WEEKDAY_HISTORY_DAYS);
  const rangeStart = historyStart < monthStart ? historyStart : monthStart;

  const [business, pnl] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { monthlyRevenuePlan: true } }),
    profitAndLoss(businessId, rangeStart, now),
  ]);
  const plan = business?.monthlyRevenuePlan == null ? null : toNumber(business.monthlyRevenuePlan);
  return projectMonth({ days: dailySeries(pnl.raw, rangeStart, now), now, plan });
}

export async function setMonthlyPlan(businessId: string, monthlyRevenuePlan: number | null) {
  const business = await prisma.business.update({ where: { id: businessId }, data: { monthlyRevenuePlan }, select: { monthlyRevenuePlan: true } });
  return { monthlyRevenuePlan: business.monthlyRevenuePlan == null ? null : toNumber(business.monthlyRevenuePlan) };
}

export async function buildAnalytics(businessId: string, query: ReportQuery) {
  const { start, end } = resolvePreset(query.preset === "custom" ? undefined : query.preset, query.from, query.to);
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  const [current, previous] = await Promise.all([profitAndLoss(businessId, start, end), profitAndLoss(businessId, prevStart, prevEnd)]);
  const s = current.statement;
  const p = previous.statement;

  const { raw } = current;
  const series = dailySeries(raw, start, end);
  const forecast = await monthForecast(businessId);

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
    forecast,
    team,
    tasks: {
      open: openTasks.length,
      overdue: openTasks.filter((t) => t.dueDate && t.dueDate < today).length,
      doneInPeriod: tasksDone.reduce((acc, t) => acc + t._count, 0),
    },
  };
}
