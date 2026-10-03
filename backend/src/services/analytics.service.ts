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

type PnlRaw = Awaited<ReturnType<typeof profitAndLoss>>["raw"];

/** Revenue, expenses and profit per calendar day, every day of the range present. */
function dailySeries(raw: PnlRaw, start: Date, end: Date) {
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

/** With fewer finished days than this in the month, the pace comes from the last two weeks instead. */
const MIN_MONTH_DAYS_FOR_PACE = 3;
const RECENT_PACE_DAYS = 14;

/**
 * Where the current calendar month will land at today's pace, and how that
 * compares with the owner's monthly revenue plan. Always about this month,
 * whatever period the rest of the page shows.
 *
 * Pace = average revenue per finished day (today is still going, so it would
 * drag the average down in the morning). Today counts as at least an average
 * day; every day after it is assumed average.
 */
async function monthForecast(businessId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = now.getDate();
  const useRecent = today - 1 < MIN_MONTH_DAYS_FOR_PACE;
  const recentStart = new Date(now.getFullYear(), now.getMonth(), today - RECENT_PACE_DAYS);
  const rangeStart = useRecent ? recentStart : monthStart;

  const [business, pnl] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { monthlyRevenuePlan: true } }),
    profitAndLoss(businessId, rangeStart, now),
  ]);
  const days = dailySeries(pnl.raw, rangeStart, now);
  const todayKey = dayKey(now);
  const monthKey = dayKey(monthStart).slice(0, 7);
  const monthDays = days.filter((d) => d.date.startsWith(monthKey));
  const todayRow = monthDays.find((d) => d.date === todayKey) ?? { revenue: 0, profit: 0 };
  const finished = monthDays.filter((d) => d.date < todayKey);
  const paceDays = useRecent ? days.filter((d) => d.date < todayKey).slice(-RECENT_PACE_DAYS) : finished;
  const sum = (rows: { revenue: number; profit: number }[], key: "revenue" | "profit") => rows.reduce((acc, d) => acc + d[key], 0);
  const avg = (key: "revenue" | "profit") => (paceDays.length ? sum(paceDays, key) / paceDays.length : todayRow[key]);

  const avgDaily = avg("revenue");
  const avgProfit = avg("profit");
  const daysAfterToday = daysInMonth - today;
  const actual = sum(finished, "revenue") + todayRow.revenue;
  const actualProfit = sum(finished, "profit") + todayRow.profit;
  const todayRevenueEstimate = Math.max(todayRow.revenue, avgDaily);
  const forecast = sum(finished, "revenue") + todayRevenueEstimate + avgDaily * daysAfterToday;
  const forecastProfit = sum(finished, "profit") + Math.max(todayRow.profit, avgProfit) + avgProfit * daysAfterToday;

  const plan = business?.monthlyRevenuePlan == null ? null : toNumber(business.monthlyRevenuePlan);
  const percentOf = (value: number) => (plan ? Math.round((value / plan) * 1000) / 10 : null);

  // Running total for the chart: actual up to today, then the projected path.
  // Today carries both so the two lines meet.
  const cumulative: { date: string; actual: number | null; forecast: number | null }[] = [];
  let running = 0;
  let projected = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = dayKey(new Date(now.getFullYear(), now.getMonth(), d));
    if (d < today) {
      running += monthDays.find((x) => x.date === date)?.revenue ?? 0;
      cumulative.push({ date, actual: round2(running), forecast: null });
    } else if (d === today) {
      projected = running + todayRevenueEstimate;
      running += todayRow.revenue;
      cumulative.push({ date, actual: round2(running), forecast: round2(projected) });
    } else {
      projected += avgDaily;
      cumulative.push({ date, actual: null, forecast: round2(projected) });
    }
  }

  return {
    month: monthKey,
    plan,
    daysInMonth,
    daysElapsed: today,
    basis: useRecent ? ("recent" as const) : ("month" as const),
    actual: round2(actual),
    actualProfit: round2(actualProfit),
    avgDaily: round2(avgDaily),
    forecast: round2(forecast),
    forecastProfit: round2(forecastProfit),
    actualPercent: percentOf(actual),
    forecastPercent: percentOf(forecast),
    // What each remaining day (today included) must bring to hit the plan.
    neededPerDay: plan === null ? null : round2(Math.max(0, plan - actual) / (daysAfterToday + 1)),
    cumulative,
  };
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
