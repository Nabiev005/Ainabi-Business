import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { toNumber, round2 } from "../utils/money";
import { CreateSaleInput, SaleQuery } from "../validators/sale.validator";

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export async function createSale(businessId: string, employeeId: string, input: CreateSaleInput) {
  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, businessId } });

  if (products.length !== productIds.length) {
    throw ApiError.badRequest("Тандалган товарлардын айрымдары табылган жок.");
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Early, friendly check (summed per product, in case one product appears
  // on several lines). The authoritative check is the conditional
  // decrement inside the transaction below.
  const requested = new Map<string, number>();
  for (const item of input.items) {
    requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
  }
  for (const [productId, quantity] of requested) {
    const product = productMap.get(productId)!;
    if (toNumber(product.quantity) < quantity) {
      throw ApiError.badRequest(`"${product.name}" складда жетишсиз (калдык: ${toNumber(product.quantity)}).`);
    }
  }

  if (input.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: input.customerId, businessId } });
    if (!customer) throw ApiError.notFound("Кардар табылган жок.");
  }

  // IMEI / serial numbers: exactly one per unit for products that require
  // them, never repeated within the sale.
  const seenSerials = new Set<string>();
  const serialsByLine = input.items.map((item) => {
    const product = productMap.get(item.productId)!;
    if (!product.requiresSerial) return [];
    const serials = (item.serialNumbers ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!Number.isInteger(item.quantity) || serials.length !== item.quantity) {
      throw ApiError.badRequest(`"${product.name}" үчүн ар бир даанага IMEI/сериялык номер жазыңыз.`);
    }
    for (const serial of serials) {
      if (seenSerials.has(serial)) throw ApiError.badRequest(`"${serial}" номери кайталанып жатат.`);
      seenSerials.add(serial);
    }
    return serials;
  });
  const allSerials = [...seenSerials];

  const now = new Date();
  let subtotal = 0;
  let costTotal = 0;
  const lineItems = input.items.map((item, index) => {
    const product = productMap.get(item.productId)!;
    const price = toNumber(product.salePrice);
    const costPrice = toNumber(product.purchasePrice);
    const total = round2(price * item.quantity);
    subtotal = round2(subtotal + total);
    costTotal = round2(costTotal + round2(costPrice * item.quantity));
    return {
      productId: item.productId,
      quantity: item.quantity,
      price,
      costPrice,
      total,
      serialNumbers: serialsByLine[index],
      warrantyUntil: product.warrantyMonths ? addMonths(now, product.warrantyMonths) : null,
    };
  });

  const discount = round2(input.discount);
  const total = round2(Math.max(0, subtotal - discount));

  if (input.paymentMethod === "DEBT" && !input.customerId) {
    throw ApiError.badRequest("Карызга сатуу үчүн кардар талап кылынат.");
  }

  const sale = await prisma.$transaction(async (tx) => {
    if (allSerials.length > 0) {
      const alreadySold = await tx.saleItem.findFirst({
        where: { serialNumbers: { hasSome: allSerials }, sale: { businessId, status: "COMPLETED" } },
        select: { serialNumbers: true },
      });
      if (alreadySold) {
        const serial = alreadySold.serialNumbers.find((s) => seenSerials.has(s)) ?? allSerials[0];
        throw ApiError.conflict(`"${serial}" номери мурун сатылган.`);
      }
    }

    const sale = await tx.sale.create({
      data: {
        businessId,
        employeeId,
        customerId: input.customerId || null,
        subtotal,
        discount,
        total,
        costTotal,
        paymentMethod: input.paymentMethod,
        items: { create: lineItems },
      },
      include: { items: { include: { product: true } }, customer: true },
    });

    for (const item of lineItems) {
      // Conditional decrement: two cashiers selling the last unit at the
      // same moment can't both succeed — the loser's whole sale rolls back.
      const { count } = await tx.product.updateMany({
        where: { id: item.productId, businessId, quantity: { gte: item.quantity } },
        data: { quantity: { decrement: item.quantity } },
      });
      if (count === 0) {
        const fresh = await tx.product.findUnique({ where: { id: item.productId } });
        throw ApiError.badRequest(`"${fresh?.name ?? ""}" складда жетишсиз (калдык: ${toNumber(fresh?.quantity)}).`);
      }

      await tx.stockMovement.create({
        data: {
          businessId,
          productId: item.productId,
          type: "SALE",
          quantity: item.quantity,
          saleId: sale.id,
          employeeId,
          comment: "Сатуудан",
        },
      });
    }

    if (input.paymentMethod === "DEBT" && input.customerId) {
      await tx.debt.create({
        data: {
          businessId,
          customerId: input.customerId,
          saleId: sale.id,
          totalAmount: total,
          paidAmount: 0,
          remainingAmount: total,
          status: "OPEN",
          comment: "Сатуудан пайда болгон карыз",
        },
      });
    }

    return sale;
  });

  return {
    id: sale.id,
    subtotal,
    discount,
    total,
    paymentMethod: sale.paymentMethod,
    customer: sale.customer ? { id: sale.customer.id, name: sale.customer.name } : null,
    items: sale.items.map((i) => ({
      productId: i.productId,
      productName: i.product.name,
      quantity: toNumber(i.quantity),
      price: toNumber(i.price),
      total: toNumber(i.total),
      serialNumbers: i.serialNumbers,
      warrantyUntil: i.warrantyUntil,
    })),
    createdAt: sale.createdAt,
  };
}

/** Warranty / return lookup: which sale did this IMEI or serial go out in? */
export async function findBySerial(businessId: string, serial: string) {
  const normalized = serial.trim().toUpperCase();
  const items = await prisma.saleItem.findMany({
    where: { serialNumbers: { has: normalized }, sale: { businessId } },
    include: { product: true, sale: { include: { customer: true, employee: { include: { user: true } } } } },
    orderBy: { sale: { createdAt: "desc" } },
    take: 10,
  });

  return items.map((i) => ({
    serial: normalized,
    saleId: i.saleId,
    saleStatus: i.sale.status,
    productId: i.productId,
    productName: i.product.name,
    price: toNumber(i.price),
    warrantyUntil: i.warrantyUntil,
    customer: i.sale.customer ? { id: i.sale.customer.id, name: i.sale.customer.name, phone: i.sale.customer.phone } : null,
    cashierName: i.sale.employee.user.name,
    soldAt: i.sale.createdAt,
  }));
}

export async function listSales(businessId: string, query: SaleQuery) {
  const where = {
    businessId,
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: { customer: true, employee: { include: { user: true } }, items: true },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.sale.count({ where }),
  ]);

  return {
    items: rows.map((s) => ({
      id: s.id,
      total: toNumber(s.total),
      discount: toNumber(s.discount),
      paymentMethod: s.paymentMethod,
      status: s.status,
      customerName: s.customer?.name ?? null,
      cashierName: s.employee.user.name,
      itemCount: s.items.length,
      createdAt: s.createdAt,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getSale(businessId: string, id: string) {
  const sale = await prisma.sale.findFirst({
    where: { id, businessId },
    include: { customer: true, employee: { include: { user: true } }, items: { include: { product: true } } },
  });
  if (!sale) throw ApiError.notFound("Сатуу табылган жок.");

  return {
    id: sale.id,
    subtotal: toNumber(sale.subtotal),
    discount: toNumber(sale.discount),
    total: toNumber(sale.total),
    paymentMethod: sale.paymentMethod,
    status: sale.status,
    customer: sale.customer ? { id: sale.customer.id, name: sale.customer.name } : null,
    cashierName: sale.employee.user.name,
    items: sale.items.map((i) => ({
      productName: i.product.name,
      quantity: toNumber(i.quantity),
      price: toNumber(i.price),
      total: toNumber(i.total),
      serialNumbers: i.serialNumbers,
      warrantyUntil: i.warrantyUntil,
    })),
    createdAt: sale.createdAt,
  };
}
