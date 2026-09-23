import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { toNumber } from "../utils/money";
import { CustomerInput } from "../validators/customer.validator";

export async function listCustomers(businessId: string, search?: string) {
  const customers = await prisma.customer.findMany({
    where: {
      businessId,
      ...(search
        ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search, mode: "insensitive" } }] }
        : {}),
    },
    include: {
      sales: { select: { total: true, createdAt: true } },
      debts: { select: { remainingAmount: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return customers.map((c) => {
    const totalSpent = c.sales.reduce((sum, s) => sum + toNumber(s.total), 0);
    const debt = c.debts.filter((d) => d.status !== "PAID").reduce((sum, d) => sum + toNumber(d.remainingAmount), 0);
    const lastPurchase = c.sales.reduce<Date | null>((latest, s) => (!latest || s.createdAt > latest ? s.createdAt : latest), null);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      notes: c.notes,
      isWholesale: c.isWholesale,
      purchaseCount: c.sales.length,
      totalSpent,
      debt,
      lastPurchaseAt: lastPurchase,
      createdAt: c.createdAt,
    };
  });
}

export async function getCustomer(businessId: string, id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, businessId },
    include: {
      sales: { orderBy: { createdAt: "desc" }, include: { items: { include: { product: true } } } },
      debts: { orderBy: { createdAt: "desc" }, include: { payments: { orderBy: { createdAt: "desc" } } } },
    },
  });
  if (!customer) throw ApiError.notFound("Кардар табылган жок.");

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    notes: customer.notes,
    isWholesale: customer.isWholesale,
    createdAt: customer.createdAt,
    sales: customer.sales.map((s) => ({
      id: s.id,
      total: toNumber(s.total),
      paymentMethod: s.paymentMethod,
      createdAt: s.createdAt,
      items: s.items.map((i) => ({
        productName: i.product.name,
        quantity: toNumber(i.quantity),
        price: toNumber(i.price),
        serialNumbers: i.serialNumbers,
        warrantyUntil: i.warrantyUntil,
      })),
    })),
    debts: customer.debts.map((d) => ({
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

export function createCustomer(businessId: string, input: CustomerInput) {
  return prisma.customer.create({
    data: { businessId, name: input.name, phone: input.phone || null, notes: input.notes || null, isWholesale: input.isWholesale },
  });
}

export async function updateCustomer(businessId: string, id: string, input: CustomerInput) {
  const existing = await prisma.customer.findFirst({ where: { id, businessId } });
  if (!existing) throw ApiError.notFound("Кардар табылган жок.");
  return prisma.customer.update({
    where: { id },
    data: { name: input.name, phone: input.phone || null, notes: input.notes || null, isWholesale: input.isWholesale },
  });
}

export async function deleteCustomer(businessId: string, id: string) {
  const existing = await prisma.customer.findFirst({ where: { id, businessId } });
  if (!existing) throw ApiError.notFound("Кардар табылган жок.");
  await prisma.customer.delete({ where: { id } });
}
