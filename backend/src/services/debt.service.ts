import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { round2, toNumber } from "../utils/money";
import { findOpenShift } from "../utils/stockLedger";
import { CreateDebtInput, CreateDebtPaymentInput } from "../validators/debt.validator";

export async function listDebts(businessId: string, status?: string) {
  const debts = await prisma.debt.findMany({
    where: { businessId, status: status === "OPEN" ? { in: ["OPEN", "PARTIAL"] } : undefined },
    include: { customer: true },
    orderBy: { createdAt: "desc" },
  });

  return debts.map((d) => ({
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
  }));
}

export async function debtSummary(businessId: string) {
  const debts = await prisma.debt.findMany({ where: { businessId, status: { in: ["OPEN", "PARTIAL"] } } });
  const total = debts.reduce((sum, d) => sum + toNumber(d.remainingAmount), 0);
  return { totalOutstanding: round2(total), openDebts: debts.length };
}

export async function createDebt(businessId: string, input: CreateDebtInput) {
  const customer = await prisma.customer.findFirst({ where: { id: input.customerId, businessId } });
  if (!customer) throw ApiError.notFound("Кардар табылган жок.");

  return prisma.debt.create({
    data: {
      businessId,
      customerId: input.customerId,
      totalAmount: input.totalAmount,
      paidAmount: 0,
      remainingAmount: input.totalAmount,
      status: "OPEN",
      comment: input.comment || null,
    },
  });
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
