import { Prisma, RepairOrder } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { round2, toNumber } from "../utils/money";
import { findOpenShift, nextNumber, resolveLocationId } from "../utils/stockLedger";
import { CreateRepairInput, RepairQuery, RepairStatusInput, UpdateRepairInput } from "../validators/repair.validator";

type RepairWithEmployee = RepairOrder & { employee: { user: { name: string } } };

function serializeRepair(r: RepairWithEmployee) {
  const finalPrice = r.finalPrice === null ? null : toNumber(r.finalPrice);
  const prepayment = toNumber(r.prepayment);
  return {
    id: r.id,
    number: r.number,
    customerId: r.customerId,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    device: r.device,
    serial: r.serial,
    problem: r.problem,
    notes: r.notes,
    estimatedPrice: r.estimatedPrice === null ? null : toNumber(r.estimatedPrice),
    prepayment,
    finalPrice,
    // What the customer still owes on pickup (nothing once delivered/cancelled).
    dueAmount:
      r.status === "DELIVERED" || r.status === "CANCELLED"
        ? 0
        : round2(Math.max(0, (finalPrice ?? toNumber(r.estimatedPrice ?? 0)) - prepayment)),
    paymentMethod: r.paymentMethod,
    status: r.status,
    employeeName: r.employee.user.name,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deliveredAt: r.deliveredAt,
  };
}

const include = { employee: { include: { user: true } } } satisfies Prisma.RepairOrderInclude;

export async function listRepairs(businessId: string, query: RepairQuery) {
  const search = query.search?.trim();
  const where: Prisma.RepairOrderWhereInput = {
    businessId,
    ...(query.status === "ACTIVE"
      ? { status: { in: ["RECEIVED", "IN_PROGRESS", "READY"] } }
      : query.status
        ? { status: query.status }
        : {}),
    ...(search
      ? {
          OR: [
            ...(/^\d+$/.test(search) ? [{ number: Number(search) }] : []),
            { customerName: { contains: search, mode: "insensitive" } },
            { customerPhone: { contains: search } },
            { device: { contains: search, mode: "insensitive" } },
            { serial: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total, counts] = await Promise.all([
    prisma.repairOrder.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.repairOrder.count({ where }),
    prisma.repairOrder.groupBy({ by: ["status"], where: { businessId }, _count: true }),
  ]);

  return {
    items: rows.map(serializeRepair),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getRepair(businessId: string, id: string) {
  const repair = await prisma.repairOrder.findFirst({ where: { id, businessId }, include });
  if (!repair) throw ApiError.notFound("Ремонт заказы табылган жок.");
  return serializeRepair(repair);
}

export async function createRepair(businessId: string, employeeId: string, input: CreateRepairInput) {
  let customerName = input.customerName || "";
  let customerPhone = input.customerPhone || null;
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, businessId } });
    if (!customer) throw ApiError.notFound("Кардар табылган жок.");
    customerName = customer.name;
    customerPhone = customerPhone ?? customer.phone;
  }

  const shift = input.prepayment > 0 ? await findOpenShift(prisma, businessId, employeeId) : null;

  const repair = await prisma.$transaction(async (tx) => {
    const number = await nextNumber(tx, businessId, "repairCounter");
    const locationId = await resolveLocationId(tx, businessId, { employeeId });
    return tx.repairOrder.create({
      data: {
        businessId,
        number,
        customerId: input.customerId || null,
        customerName,
        customerPhone,
        device: input.device,
        serial: input.serial || null,
        problem: input.problem,
        notes: input.notes || null,
        estimatedPrice: input.estimatedPrice ?? null,
        prepayment: input.prepayment,
        employeeId,
        locationId,
        prepaymentShiftId: shift?.id ?? null,
      },
      include,
    });
  });
  return serializeRepair(repair);
}

export async function updateRepair(businessId: string, id: string, input: UpdateRepairInput) {
  const repair = await prisma.repairOrder.findFirst({ where: { id, businessId } });
  if (!repair) throw ApiError.notFound("Ремонт заказы табылган жок.");
  if (repair.status === "DELIVERED" || repair.status === "CANCELLED") {
    throw ApiError.badRequest("Жабылган заказды өзгөртүүгө болбойт.");
  }
  const updated = await prisma.repairOrder.update({
    where: { id },
    data: {
      device: input.device,
      serial: input.serial === undefined ? undefined : input.serial || null,
      problem: input.problem,
      notes: input.notes === undefined ? undefined : input.notes || null,
      estimatedPrice: input.estimatedPrice === undefined ? undefined : input.estimatedPrice,
      finalPrice: input.finalPrice === undefined ? undefined : input.finalPrice,
      customerPhone: input.customerPhone === undefined ? undefined : input.customerPhone || null,
    },
    include,
  });
  return serializeRepair(updated);
}

const TRANSITIONS: Record<string, string[]> = {
  RECEIVED: ["IN_PROGRESS", "READY", "CANCELLED"],
  IN_PROGRESS: ["READY", "RECEIVED", "CANCELLED"],
  READY: ["DELIVERED", "IN_PROGRESS", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export async function changeRepairStatus(businessId: string, employeeId: string, id: string, input: RepairStatusInput) {
  const repair = await prisma.repairOrder.findFirst({ where: { id, businessId } });
  if (!repair) throw ApiError.notFound("Ремонт заказы табылган жок.");
  if (!TRANSITIONS[repair.status].includes(input.status)) {
    throw ApiError.badRequest("Заказдын абалын мындай өзгөртүүгө болбойт.");
  }

  const data: Prisma.RepairOrderUpdateInput = { status: input.status };
  if (input.status === "DELIVERED") {
    const finalPrice = input.finalPrice ?? (repair.finalPrice === null ? null : toNumber(repair.finalPrice));
    if (finalPrice === null) throw ApiError.badRequest("Ремонттун акыркы баасын жазыңыз.");
    if (finalPrice < toNumber(repair.prepayment)) throw ApiError.badRequest("Акыркы баа алдын ала төлөмдөн аз болбошу керек.");
    const shift = await findOpenShift(prisma, businessId, employeeId);
    data.finalPrice = finalPrice;
    data.paymentMethod = input.paymentMethod ?? "CASH";
    data.deliveredAt = new Date();
    data.deliveryShiftId = shift?.id ?? null;
  }

  const updated = await prisma.repairOrder.update({ where: { id }, data, include });
  return serializeRepair(updated);
}
