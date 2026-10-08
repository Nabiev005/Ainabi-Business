import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { round2, toNumber } from "../utils/money";
import { dayKey } from "../utils/dateRange";
import { findOpenShift } from "../utils/stockLedger";
import { CreateDebtInput, CreateDebtPaymentInput, DebtScheduleInput } from "../validators/debt.validator";
import { buildSchedule, Installment, needsReminder, scheduleStatus } from "./installments";

type DebtWithPlan = Prisma.DebtGetPayload<{ include: { customer: true; installments: true } }>;

/** The debt's plan as installments: its own plan, or its single due date as one payment. */
function planOf(debt: DebtWithPlan): Installment[] {
  if (debt.installments.length > 0) {
    return debt.installments.map((i) => ({ dueDate: i.dueDate, amount: toNumber(i.amount) }));
  }
  return debt.dueDate ? [{ dueDate: debt.dueDate, amount: toNumber(debt.totalAmount) }] : [];
}

function serializeDebt(d: DebtWithPlan, today: string) {
  const status = scheduleStatus(planOf(d), toNumber(d.paidAmount), today);
  const open = d.status !== "PAID";
  return {
    id: d.id,
    customerId: d.customerId,
    customerName: d.customer.name,
    customerPhone: d.customer.phone,
    totalAmount: toNumber(d.totalAmount),
    paidAmount: toNumber(d.paidAmount),
    remainingAmount: toNumber(d.remainingAmount),
    status: d.status,
    comment: d.comment,
    createdAt: d.createdAt,
    saleId: d.saleId,
    installmentsCount: d.installments.length,
    nextDueDate: open ? (status.next?.dueDate ?? null) : null,
    nextDueAmount: open ? (status.next?.amount ?? null) : null,
    overdueAmount: open ? status.overdueAmount : 0,
    daysOverdue: open ? status.daysOverdue : 0,
    needsReminder: open && needsReminder(status, today),
    lastRemindedAt: d.lastRemindedAt,
  };
}

export async function listDebts(businessId: string, status?: string) {
  const debts = await prisma.debt.findMany({
    where: { businessId, status: status === "OPEN" ? { in: ["OPEN", "PARTIAL"] } : undefined },
    include: { customer: true, installments: true },
    orderBy: { createdAt: "desc" },
  });
  const today = dayKey(new Date());
  return debts.map((d) => serializeDebt(d, today));
}

/** Open debts that are overdue or fall due within a few days — the "remind today" list, most overdue first. */
export async function listReminders(businessId: string) {
  const debts = await listDebts(businessId, "OPEN");
  return debts
    .filter((d) => d.needsReminder && d.customerPhone)
    .sort((a, b) => b.daysOverdue - a.daysOverdue || (a.nextDueDate ?? "").localeCompare(b.nextDueDate ?? ""));
}

export async function getDebt(businessId: string, id: string) {
  const debt = await prisma.debt.findFirst({
    where: { id, businessId },
    include: { customer: true, installments: true, payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!debt) throw ApiError.notFound("Карыз табылган жок.");
  const today = dayKey(new Date());
  const status = scheduleStatus(planOf(debt), toNumber(debt.paidAmount), today);
  return {
    ...serializeDebt(debt, today),
    dueDate: debt.dueDate,
    schedule: status.items,
    payments: debt.payments.map((p) => ({ id: p.id, amount: toNumber(p.amount), method: p.method, comment: p.comment, createdAt: p.createdAt })),
  };
}

export async function debtSummary(businessId: string) {
  const debts = await listDebts(businessId, "OPEN");
  return {
    totalOutstanding: round2(debts.reduce((sum, d) => sum + d.remainingAmount, 0)),
    openDebts: debts.length,
    overdueAmount: round2(debts.reduce((sum, d) => sum + d.overdueAmount, 0)),
    overdueCount: debts.filter((d) => d.overdueAmount > 0).length,
    remindToday: debts.filter((d) => d.needsReminder).length,
  };
}

/** Rows to create for a schedule input (empty = no plan). */
function planRows(total: number, input: DebtScheduleInput) {
  if (!input.installments) return [];
  const { count, firstDueDate, intervalMonths } = input.installments;
  return buildSchedule(total, count, firstDueDate, intervalMonths).map((p, position) => ({ ...p, position }));
}

export async function createDebt(businessId: string, input: CreateDebtInput) {
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, businessId } });
  if (!customer) throw ApiError.notFound("Кардар табылган жок.");

  const rows = planRows(input.totalAmount, input);
  return prisma.debt.create({
    data: {
      businessId,
      customerId: input.customerId,
      totalAmount: input.totalAmount,
      paidAmount: 0,
      remainingAmount: input.totalAmount,
      status: "OPEN",
      comment: input.comment || null,
      dueDate: rows.length > 0 ? null : input.dueDate || null,
      installments: rows.length > 0 ? { create: rows } : undefined,
    },
  });
}

/**
 * Sets (or clears) the payment plan of an existing debt — e.g. a sale on
 * credit at the POS that the owner turns into a 6-month plan afterwards.
 * The plan always covers the debt's full amount; what was already paid
 * counts towards the first installments.
 */
export async function setSchedule(businessId: string, id: string, input: DebtScheduleInput) {
  const debt = await prisma.debt.findFirst({ where: { id, businessId } });
  if (!debt) throw ApiError.notFound("Карыз табылган жок.");
  if (debt.status === "PAID") throw ApiError.badRequest("Карыз толук төлөнгөн.");

  const rows = planRows(toNumber(debt.totalAmount), input);
  await prisma.$transaction([
    prisma.debtInstallment.deleteMany({ where: { debtId: id } }),
    prisma.debt.update({
      where: { id },
      data: {
        dueDate: rows.length > 0 ? null : input.dueDate || null,
        installments: rows.length > 0 ? { create: rows } : undefined,
      },
    }),
  ]);
  return getDebt(businessId, id);
}

/** Someone opened WhatsApp with the reminder text for this customer. */
export async function markReminded(businessId: string, id: string) {
  const { count } = await prisma.debt.updateMany({ where: { id, businessId }, data: { lastRemindedAt: new Date() } });
  if (count === 0) throw ApiError.notFound("Карыз табылган жок.");
}

export async function addPayment(businessId: string, debtId: string, input: CreateDebtPaymentInput, employeeId?: string) {
  const debt = await prisma.debt.findFirst({ where: { id: debtId, businessId } });
  if (!debt) throw ApiError.notFound("Карыз табылган жок.");

  const remaining = toNumber(debt.remainingAmount);
  if (input.amount > remaining) {
    throw ApiError.badRequest(`Төлөм суммасы карыздан ашпашы керек (калган: ${remaining} сом).`);
  }

  const shift = employeeId ? await findOpenShift(prisma, businessId, employeeId) : null;

  // Relative, conditional update: two payments arriving together can't both
  // read the same "remaining" and overpay the debt.
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.debt.updateMany({
      where: { id: debtId, remainingAmount: { gte: input.amount } },
      data: { paidAmount: { increment: input.amount }, remainingAmount: { decrement: input.amount } },
    });
    if (count === 0) throw ApiError.badRequest(`Төлөм суммасы карыздан ашпашы керек (калган: ${remaining} сом).`);
    const updated = await tx.debt.findUniqueOrThrow({ where: { id: debtId } });
    await tx.debt.update({
      where: { id: debtId },
      data: { status: toNumber(updated.remainingAmount) <= 0 ? "PAID" : "PARTIAL" },
    });
    return tx.debtPayment.create({
      data: { debtId, amount: input.amount, method: input.method, comment: input.comment || null, shiftId: shift?.id ?? null },
    });
  });
}
