import { prisma } from "../config/prisma";
import { round2, toNumber } from "../utils/money";
import { resolvePreset } from "../utils/dateRange";
import { EmployeeActivity, isNight, riskLevel, signalsFor } from "./risk";
import type { ReportQuery } from "../validators/report.validator";

/** How close to the cap a discount must be to count as "at the cap". */
const CAP_SHARE = 0.9;
const MAX_EVENTS = 40;

export type RiskEventType = "BELOW_COST" | "MAX_DISCOUNT" | "WHOLESALE" | "CASH_SHORT" | "STOCK_OUT" | "INVENTORY_SHORTAGE" | "NIGHT_SALE" | "RETURN";

interface RiskEvent {
  type: RiskEventType;
  at: Date;
  employeeName: string;
  amount: number;
  saleId?: string;
  saleNumber?: number | null;
  note?: string | null;
}

/**
 * Per-employee till-watch report for a period: signals and a level for
 * everyone who worked, plus the individual events behind them, newest first.
 */
export async function buildRiskReport(businessId: string, query: ReportQuery) {
  const { start, end } = resolvePreset(query.preset === "custom" ? undefined : query.preset, query.from, query.to);
  const range = { gte: start, lte: end };

  const [business, employees, sales, returns, shifts, movements, counts] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { maxDiscountPercent: true } }),
    prisma.employee.findMany({ where: { businessId }, include: { user: { select: { name: true } } } }),
    prisma.sale.findMany({
      where: { businessId, createdAt: range, status: "COMPLETED" },
      select: {
        id: true,
        number: true,
        employeeId: true,
        subtotal: true,
        discount: true,
        total: true,
        priceLevel: true,
        createdAt: true,
        customer: { select: { isWholesale: true } },
        items: { select: { quantity: true, costPrice: true, total: true, product: { select: { name: true } } } },
      },
    }),
    prisma.saleReturn.findMany({
      where: { businessId, createdAt: range },
      select: { total: true, createdAt: true, reason: true, saleId: true, sale: { select: { employeeId: true, number: true } } },
    }),
    prisma.cashShift.findMany({
      where: { businessId, status: "CLOSED", closedAt: range },
      select: { employeeId: true, difference: true, closedAt: true, note: true },
    }),
    prisma.stockMovement.findMany({
      where: { businessId, createdAt: range, type: { in: ["OUT", "WRITE_OFF"] }, employeeId: { not: null } },
      select: { employeeId: true, type: true, quantity: true, createdAt: true, comment: true, product: { select: { name: true, purchasePrice: true } } },
    }),
    prisma.inventoryCount.findMany({
      where: { businessId, createdAt: range, shortageValue: { gt: 0 } },
      select: { employeeId: true, shortageValue: true, createdAt: true },
    }),
  ]);

  const names = new Map(employees.map((e) => [e.id, e.user.name]));
  const blank = (id: string): EmployeeActivity => ({
    employeeId: id,
    name: names.get(id) ?? "—",
    revenue: 0,
    salesCount: 0,
    discount: 0,
    subtotal: 0,
    maxedDiscounts: 0,
    belowCostLoss: 0,
    belowCostSales: 0,
    wholesaleNoCustomer: 0,
    returnsValue: 0,
    returnsCount: 0,
    cashShort: 0,
    shortShifts: 0,
    stockOutValue: 0,
    inventoryShortage: 0,
    nightSales: 0,
  });
  const activity = new Map<string, EmployeeActivity>();
  const of = (id: string) => {
    let a = activity.get(id);
    if (!a) activity.set(id, (a = blank(id)));
    return a;
  };
  const events: RiskEvent[] = [];
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? "—") : "—");

  for (const sale of sales) {
    const a = of(sale.employeeId);
    const subtotal = toNumber(sale.subtotal);
    const discount = toNumber(sale.discount);
    a.revenue += toNumber(sale.total);
    a.subtotal += subtotal;
    a.discount += discount;
    a.salesCount += 1;

    const cap = (subtotal * business.maxDiscountPercent) / 100;
    if (discount > 0 && cap > 0 && discount >= cap * CAP_SHARE) {
      a.maxedDiscounts += 1;
      events.push({ type: "MAX_DISCOUNT", at: sale.createdAt, employeeName: a.name, amount: discount, saleId: sale.id, saleNumber: sale.number });
    }

    // Line totals are before the receipt discount; compare with cost per line.
    const loss = sale.items.reduce((s, i) => s + Math.max(0, toNumber(i.costPrice) * toNumber(i.quantity) - toNumber(i.total)), 0);
    if (loss > 0.5) {
      a.belowCostLoss += loss;
      a.belowCostSales += 1;
      const worst = sale.items.find((i) => toNumber(i.costPrice) * toNumber(i.quantity) > toNumber(i.total));
      events.push({ type: "BELOW_COST", at: sale.createdAt, employeeName: a.name, amount: round2(loss), saleId: sale.id, saleNumber: sale.number, note: worst?.product.name });
    }

    if (sale.priceLevel === "WHOLESALE" && !sale.customer?.isWholesale) {
      a.wholesaleNoCustomer += 1;
      events.push({ type: "WHOLESALE", at: sale.createdAt, employeeName: a.name, amount: toNumber(sale.total), saleId: sale.id, saleNumber: sale.number });
    }

    if (isNight(sale.createdAt)) {
      a.nightSales += 1;
      events.push({ type: "NIGHT_SALE", at: sale.createdAt, employeeName: a.name, amount: toNumber(sale.total), saleId: sale.id, saleNumber: sale.number });
    }
  }

  for (const r of returns) {
    const a = of(r.sale.employeeId);
    a.returnsValue += toNumber(r.total);
    a.returnsCount += 1;
    events.push({ type: "RETURN", at: r.createdAt, employeeName: a.name, amount: toNumber(r.total), saleId: r.saleId, saleNumber: r.sale.number, note: r.reason });
  }

  for (const s of shifts) {
    const diff = s.difference === null ? 0 : toNumber(s.difference);
    if (diff >= 0) continue;
    const a = of(s.employeeId);
    a.cashShort += -diff;
    a.shortShifts += 1;
    events.push({ type: "CASH_SHORT", at: s.closedAt ?? end, employeeName: a.name, amount: -diff, note: s.note });
  }

  for (const m of movements) {
    const value = toNumber(m.quantity) * toNumber(m.product.purchasePrice);
    const a = of(m.employeeId!);
    a.stockOutValue += value;
    events.push({ type: "STOCK_OUT", at: m.createdAt, employeeName: a.name, amount: round2(value), note: [m.product.name, m.comment].filter(Boolean).join(" — ") });
  }

  for (const c of counts) {
    const a = of(c.employeeId);
    a.inventoryShortage += toNumber(c.shortageValue);
    events.push({ type: "INVENTORY_SHORTAGE", at: c.createdAt, employeeName: nameOf(c.employeeId), amount: toNumber(c.shortageValue) });
  }

  const people = [...activity.values()]
    .map((a) => {
      const signals = signalsFor(a);
      return {
        employeeId: a.employeeId,
        name: a.name,
        revenue: round2(a.revenue),
        salesCount: a.salesCount,
        ...riskLevel(signals),
        signals,
      };
    })
    .sort((x, y) => y.score - x.score || y.revenue - x.revenue);

  return {
    range: { from: start.toISOString(), to: end.toISOString() },
    maxDiscountPercent: business.maxDiscountPercent,
    people,
    events: events
      .sort((x, y) => y.at.getTime() - x.at.getTime())
      .slice(0, MAX_EVENTS)
      .map((e) => ({ ...e, amount: round2(e.amount) })),
  };
}
