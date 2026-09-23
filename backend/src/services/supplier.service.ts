import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { round2, toNumber } from "../utils/money";
import { CreateSupplierDebtInput, SupplierInput, SupplierPaymentInput } from "../validators/supplier.validator";

export async function listSuppliers(businessId: string, search?: string) {
  const suppliers = await prisma.supplier.findMany({
    where: {
      businessId,
      ...(search
        ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search, mode: "insensitive" } }] }
        : {}),
    },
    include: {
      stockMovements: { where: { type: "IN" }, select: { quantity: true, purchasePrice: true, createdAt: true } },
      debts: { select: { remainingAmount: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return suppliers.map((s) => {
    const totalPurchased = s.stockMovements.reduce((sum, m) => sum + toNumber(m.quantity) * toNumber(m.purchasePrice ?? 0), 0);
    const lastDelivery = s.stockMovements.reduce<Date | null>((latest, m) => (!latest || m.createdAt > latest ? m.createdAt : latest), null);
    const debt = s.debts.filter((d) => d.status !== "PAID").reduce((sum, d) => sum + toNumber(d.remainingAmount), 0);
    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      address: s.address,
      totalPurchased: round2(totalPurchased),
      debt: round2(debt),
      lastDeliveryAt: lastDelivery,
      createdAt: s.createdAt,
    };
  });
}

export async function supplierDebtSummary(businessId: string) {
  const debts = await prisma.supplierDebt.findMany({ where: { businessId, status: { in: ["OPEN", "PARTIAL"] } } });
  const total = debts.reduce((sum, d) => sum + toNumber(d.remainingAmount), 0);
  return { totalOutstanding: round2(total), openDebts: debts.length };
}

export async function getSupplier(businessId: string, id: string) {
  const supplier = await prisma.supplier.findFirst({
    where: { id, businessId },
    include: {
      stockMovements: {
        where: { type: "IN" },
        orderBy: { createdAt: "desc" },
        include: { product: true },
      },
      debts: {
        orderBy: { createdAt: "desc" },
        include: { payments: { orderBy: { createdAt: "desc" } } },
      },
    },
  });
  if (!supplier) throw ApiError.notFound("Жеткирүүчү табылган жок.");

  return {
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    address: supplier.address,
    createdAt: supplier.createdAt,
    deliveries: supplier.stockMovements.map((m) => ({
      id: m.id,
      productName: m.product.name,
      quantity: toNumber(m.quantity),
      purchasePrice: m.purchasePrice ? toNumber(m.purchasePrice) : null,
      total: m.purchasePrice ? round2(toNumber(m.quantity) * toNumber(m.purchasePrice)) : null,
      createdAt: m.createdAt,
    })),
    debts: supplier.debts.map((d) => ({
      id: d.id,
      totalAmount: toNumber(d.totalAmount),
      paidAmount: toNumber(d.paidAmount),
      remainingAmount: toNumber(d.remainingAmount),
      status: d.status,
      comment: d.comment,
      createdAt: d.createdAt,
      payments: d.payments.map((p) => ({ id: p.id, amount: toNumber(p.amount), method: p.method, createdAt: p.createdAt })),
    })),
  };
}

export function createSupplier(businessId: string, input: SupplierInput) {
  return prisma.supplier.create({ data: { businessId, name: input.name, phone: input.phone || null, address: input.address || null } });
}

export async function updateSupplier(businessId: string, id: string, input: SupplierInput) {
  const existing = await prisma.supplier.findFirst({ where: { id, businessId } });
  if (!existing) throw ApiError.notFound("Жеткирүүчү табылган жок.");
  return prisma.supplier.update({ where: { id }, data: { name: input.name, phone: input.phone || null, address: input.address || null } });
}

export async function deleteSupplier(businessId: string, id: string) {
  const existing = await prisma.supplier.findFirst({ where: { id, businessId } });
  if (!existing) throw ApiError.notFound("Жеткирүүчү табылган жок.");
  await prisma.supplier.delete({ where: { id } });
}

export async function createSupplierDebt(businessId: string, supplierId: string, input: CreateSupplierDebtInput) {
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, businessId } });
  if (!supplier) throw ApiError.notFound("Жеткирүүчү табылган жок.");

  return prisma.supplierDebt.create({
    data: {
      businessId,
      supplierId,
      totalAmount: input.totalAmount,
      paidAmount: 0,
      remainingAmount: input.totalAmount,
      status: "OPEN",
      comment: input.comment || null,
    },
  });
}

export async function addSupplierPayment(businessId: string, debtId: string, input: SupplierPaymentInput) {
  const debt = await prisma.supplierDebt.findFirst({ where: { id: debtId, businessId } });
  if (!debt) throw ApiError.notFound("Карыз табылган жок.");

  const remaining = toNumber(debt.remainingAmount);
  if (input.amount > remaining) {
    throw ApiError.badRequest(`Төлөм суммасы карыздан ашпашы керек (калган: ${remaining} сом).`);
  }

  return prisma.$transaction(async (tx) => {
    const { count } = await tx.supplierDebt.updateMany({
      where: { id: debtId, remainingAmount: { gte: input.amount } },
      data: { paidAmount: { increment: input.amount }, remainingAmount: { decrement: input.amount } },
    });
    if (count === 0) throw ApiError.badRequest(`Төлөм суммасы карыздан ашпашы керек (калган: ${remaining} сом).`);
    const updated = await tx.supplierDebt.findUniqueOrThrow({ where: { id: debtId } });
    await tx.supplierDebt.update({
      where: { id: debtId },
      data: { status: toNumber(updated.remainingAmount) <= 0 ? "PAID" : "PARTIAL" },
    });
    return tx.supplierPayment.create({
      data: { supplierDebtId: debtId, amount: input.amount, method: input.method, comment: input.comment || null },
    });
  });
}
