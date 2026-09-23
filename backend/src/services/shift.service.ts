import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { round2, toNumber } from "../utils/money";
import { findOpenShift, resolveLocationId } from "../utils/stockLedger";

/**
 * Everything that moved cash in or out of the drawer during a shift. The
 * expected amount at close is:
 *   opening cash
 *   + cash sales − cash refunds
 *   + cash debt payments received
 *   + repair prepayments / pickups paid in cash
 *   − cash paid out for purchases / trade-ins
 *   + cash put in − cash taken out (collections)
 */
async function shiftTotals(shiftId: string) {
  const shift = await prisma.cashShift.findUniqueOrThrow({ where: { id: shiftId }, include: { movements: true } });

  const [salesByMethod, cashReturns, debtPayments, prepayments, deliveries, receipts] = await Promise.all([
    prisma.sale.groupBy({ by: ["paymentMethod"], where: { shiftId }, _sum: { total: true }, _count: true }),
    prisma.saleReturn.aggregate({ where: { shiftId, refundMethod: "CASH" }, _sum: { total: true } }),
    prisma.debtPayment.aggregate({ where: { shiftId, method: "CASH" }, _sum: { amount: true } }),
    prisma.repairOrder.aggregate({ where: { prepaymentShiftId: shiftId }, _sum: { prepayment: true } }),
    prisma.repairOrder.findMany({ where: { deliveryShiftId: shiftId, paymentMethod: "CASH" }, select: { finalPrice: true, prepayment: true } }),
    prisma.purchaseReceipt.aggregate({ where: { shiftId, paymentMethod: "CASH" }, _sum: { paidAmount: true } }),
  ]);

  const sales = Object.fromEntries(
    salesByMethod.map((s) => [s.paymentMethod, { total: toNumber(s._sum.total), count: s._count }]),
  ) as Record<string, { total: number; count: number }>;
  const cashIn = shift.movements.filter((m) => m.type === "IN").reduce((s, m) => s + toNumber(m.amount), 0);
  const cashOut = shift.movements.filter((m) => m.type === "OUT").reduce((s, m) => s + toNumber(m.amount), 0);
  const repairCash =
    toNumber(prepayments._sum.prepayment) +
    deliveries.reduce((s, r) => s + Math.max(0, toNumber(r.finalPrice) - toNumber(r.prepayment)), 0);

  const breakdown = {
    openingCash: toNumber(shift.openingCash),
    cashSales: sales.CASH?.total ?? 0,
    cardSales: sales.CARD?.total ?? 0,
    qrSales: sales.QR?.total ?? 0,
    debtSales: sales.DEBT?.total ?? 0,
    salesCount: Object.values(sales).reduce((s, v) => s + v.count, 0),
    cashRefunds: toNumber(cashReturns._sum.total),
    debtPaymentsCash: toNumber(debtPayments._sum.amount),
    repairCash: round2(repairCash),
    purchasesCash: toNumber(receipts._sum.paidAmount),
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
  };
  const expectedCash = round2(
    breakdown.openingCash +
      breakdown.cashSales -
      breakdown.cashRefunds +
      breakdown.debtPaymentsCash +
      breakdown.repairCash -
      breakdown.purchasesCash +
      breakdown.cashIn -
      breakdown.cashOut,
  );
  return { shift, breakdown, expectedCash };
}

async function serializeShift(shiftId: string) {
  const { shift, breakdown, expectedCash } = await shiftTotals(shiftId);
  const employee = await prisma.employee.findUnique({ where: { id: shift.employeeId }, include: { user: true } });
  const location = shift.locationId ? await prisma.location.findUnique({ where: { id: shift.locationId } }) : null;
  return {
    id: shift.id,
    status: shift.status,
    employeeName: employee?.user.name ?? null,
    locationName: location?.name ?? null,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    note: shift.note,
    breakdown,
    // While open this is live; once closed it's the frozen value.
    expectedCash: shift.status === "CLOSED" ? toNumber(shift.expectedCash) : expectedCash,
    countedCash: shift.countedCash === null ? null : toNumber(shift.countedCash),
    difference: shift.difference === null ? null : toNumber(shift.difference),
    movements: shift.movements
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => ({ id: m.id, type: m.type, amount: toNumber(m.amount), reason: m.reason, createdAt: m.createdAt })),
  };
}

export async function getCurrentShift(businessId: string, employeeId: string) {
  const shift = await findOpenShift(prisma, businessId, employeeId);
  return shift ? serializeShift(shift.id) : null;
}

export async function openShift(businessId: string, employeeId: string, openingCash: number) {
  const existing = await findOpenShift(prisma, businessId, employeeId);
  if (existing) throw ApiError.conflict("Сизде ачык смена бар.");
  const locationId = await resolveLocationId(prisma, businessId, { employeeId });
  const shift = await prisma.cashShift.create({ data: { businessId, employeeId, locationId, openingCash } });
  return serializeShift(shift.id);
}

export async function closeShift(businessId: string, employeeId: string, role: string, shiftId: string, countedCash: number, note?: string | null) {
  const shift = await prisma.cashShift.findFirst({ where: { id: shiftId, businessId } });
  if (!shift) throw ApiError.notFound("Смена табылган жок.");
  if (shift.status === "CLOSED") throw ApiError.badRequest("Смена мурунтан жабылган.");
  // A cashier closes their own shift; a manager may close anyone's.
  if (shift.employeeId !== employeeId && role === "CASHIER") throw ApiError.forbidden();

  const { expectedCash } = await shiftTotals(shiftId);
  await prisma.cashShift.update({
    where: { id: shiftId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      expectedCash,
      countedCash,
      difference: round2(countedCash - expectedCash),
      note: note || null,
    },
  });
  return serializeShift(shiftId);
}

export async function addCashMovement(
  businessId: string,
  employeeId: string,
  input: { type: "IN" | "OUT"; amount: number; reason?: string | null },
) {
  const shift = await findOpenShift(prisma, businessId, employeeId);
  if (!shift) throw ApiError.badRequest("Адегенде кассалык сменаны ачыңыз.");
  await prisma.cashMovement.create({ data: { shiftId: shift.id, type: input.type, amount: input.amount, reason: input.reason || null } });
  return serializeShift(shift.id);
}

export async function listShifts(businessId: string, employeeId: string, role: string, page: number, pageSize: number) {
  // Cashiers only see their own shifts.
  const where = { businessId, ...(role === "CASHIER" ? { employeeId } : {}) };
  const [rows, total] = await Promise.all([
    prisma.cashShift.findMany({
      where,
      include: { employee: { include: { user: true } } },
      orderBy: { openedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.cashShift.count({ where }),
  ]);
  return {
    items: rows.map((s) => ({
      id: s.id,
      status: s.status,
      employeeName: s.employee.user.name,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openingCash: toNumber(s.openingCash),
      expectedCash: s.expectedCash === null ? null : toNumber(s.expectedCash),
      countedCash: s.countedCash === null ? null : toNumber(s.countedCash),
      difference: s.difference === null ? null : toNumber(s.difference),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getShift(businessId: string, employeeId: string, role: string, id: string) {
  const shift = await prisma.cashShift.findFirst({ where: { id, businessId } });
  if (!shift) throw ApiError.notFound("Смена табылган жок.");
  if (role === "CASHIER" && shift.employeeId !== employeeId) throw ApiError.forbidden();
  return serializeShift(id);
}
