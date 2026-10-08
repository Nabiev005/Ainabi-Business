import { Prisma, WholesaleOrderStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { round2, toNumber } from "../utils/money";
import { hasPermission, Role } from "../config/permissions";
import { createSale } from "./sale.service";
import { createReceipt } from "./stock.service";
import { createReceiptSchema } from "../validators/stock.validator";
import type { CreateWholesaleOrderInput, WholesaleStatusInput } from "../validators/wholesale.validator";

/**
 * Wholesale network between Ainabi shops. A wholesaler switches it on and
 * its products that have a wholesale price and stock become orderable by
 * other shops. Each order is visible to exactly two businesses — the buyer
 * and the seller — and only what the other side needs is shown: names,
 * wholesale prices, availability; never purchase prices or stock counts.
 */

const PAGE_SIZE = 30;

const listedProduct = (sellerId: string): Prisma.ProductWhereInput => ({
  businessId: sellerId,
  status: "ACTIVE",
  quantity: { gt: 0 },
  wholesalePrice: { not: null },
});

// ---------- settings ----------

export async function getSettings(businessId: string) {
  return prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { wholesaleEnabled: true, wholesaleNote: true } });
}

export async function updateSettings(businessId: string, input: { enabled: boolean; note?: string | null }) {
  await prisma.business.update({ where: { id: businessId }, data: { wholesaleEnabled: input.enabled, wholesaleNote: input.note?.trim() || null } });
  return getSettings(businessId);
}

// ---------- browsing ----------

export async function listSuppliers(businessId: string, search?: string) {
  const q = search?.trim();
  const sellers = await prisma.business.findMany({
    where: {
      wholesaleEnabled: true,
      id: { not: businessId },
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { address: { contains: q, mode: "insensitive" } }] } : {}),
    },
    select: { id: true, name: true, address: true, phone: true, wholesaleNote: true },
    orderBy: { name: "asc" },
    take: 100,
  });
  const counts = await prisma.product.groupBy({
    by: ["businessId"],
    where: { businessId: { in: sellers.map((s) => s.id) }, status: "ACTIVE", quantity: { gt: 0 }, wholesalePrice: { not: null } },
    _count: true,
  });
  const countBy = new Map(counts.map((c) => [c.businessId, c._count]));
  return sellers
    .map((s) => ({ id: s.id, name: s.name, address: s.address, phone: s.phone, note: s.wholesaleNote, productsCount: countBy.get(s.id) ?? 0 }))
    .filter((s) => s.productsCount > 0);
}

async function assertSeller(businessId: string, sellerId: string) {
  if (sellerId === businessId) throw ApiError.badRequest("Өзүңүздөн заказ берүүгө болбойт.");
  const seller = await prisma.business.findFirst({ where: { id: sellerId, wholesaleEnabled: true }, select: { id: true, name: true, phone: true, address: true, wholesaleNote: true } });
  if (!seller) throw ApiError.notFound("Оптомчу табылган жок.");
  return seller;
}

export async function listSupplierProducts(businessId: string, sellerId: string, query: { search?: string; page: number }) {
  const seller = await assertSeller(businessId, sellerId);
  const q = query.search?.trim();
  const where: Prisma.ProductWhereInput = {
    ...listedProduct(sellerId),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { barcode: q }, { attributesText: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: { id: true, name: true, barcode: true, unit: true, wholesalePrice: true, imageUrl: true, category: { select: { name: true } } },
      orderBy: { name: "asc" },
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ]);
  return {
    seller: { id: seller.id, name: seller.name, phone: seller.phone, address: seller.address, note: seller.wholesaleNote },
    items: items.map((p) => ({ id: p.id, name: p.name, barcode: p.barcode, unit: p.unit, category: p.category?.name ?? null, price: toNumber(p.wholesalePrice), imageUrl: p.imageUrl })),
    page: query.page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

// ---------- orders ----------

const orderInclude = {
  items: true,
  buyerBusiness: { select: { id: true, name: true, phone: true, address: true } },
  sellerBusiness: { select: { id: true, name: true, phone: true, address: true } },
} as const;
type OrderRow = Prisma.WholesaleOrderGetPayload<{ include: typeof orderInclude }>;

function serialize(order: OrderRow, businessId: string) {
  return {
    id: order.id,
    side: order.sellerBusinessId === businessId ? ("SELLER" as const) : ("BUYER" as const),
    status: order.status,
    total: toNumber(order.total),
    comment: order.comment,
    sellerNote: order.sellerNote,
    createdByName: order.createdByName,
    saleId: order.saleId,
    receiptId: order.receiptId,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    buyer: order.buyerBusiness,
    seller: order.sellerBusiness,
    items: order.items.map((i) => ({ id: i.id, productId: i.productId, name: i.name, barcode: i.barcode, unit: i.unit, price: toNumber(i.price), quantity: toNumber(i.quantity) })),
  };
}

export async function createOrder(businessId: string, employeeId: string, input: CreateWholesaleOrderInput) {
  await assertSeller(businessId, input.sellerBusinessId);
  const ids = [...new Set(input.items.map((i) => i.productId))];
  if (ids.length !== input.items.length) throw ApiError.badRequest("Бир товар тизмеде эки жолу турат.");
  const products = await prisma.product.findMany({ where: { ...listedProduct(input.sellerBusinessId), id: { in: ids } } });
  if (products.length !== ids.length) throw ApiError.badRequest("Айрым товарлар азыр оптомго жеткиликсиз. Тизмени жаңыртыңыз.");
  const byId = new Map(products.map((p) => [p.id, p]));
  const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { user: { select: { name: true } } } });

  const lines = input.items.map((i) => {
    const p = byId.get(i.productId)!;
    return { productId: p.id, name: p.name, barcode: p.barcode, unit: p.unit, price: toNumber(p.wholesalePrice), quantity: i.quantity };
  });
  const order = await prisma.wholesaleOrder.create({
    data: {
      buyerBusinessId: businessId,
      sellerBusinessId: input.sellerBusinessId,
      total: round2(lines.reduce((s, l) => s + l.price * l.quantity, 0)),
      comment: input.comment || null,
      createdByName: employee.user.name,
      items: { create: lines },
    },
    include: orderInclude,
  });
  return serialize(order, businessId);
}

function visibleWhere(businessId: string, role: Role): Prisma.WholesaleOrderWhereInput {
  const sides: Prisma.WholesaleOrderWhereInput[] = [];
  if (hasPermission(role, "wholesale.buy")) sides.push({ buyerBusinessId: businessId });
  if (hasPermission(role, "wholesale.sell")) sides.push({ sellerBusinessId: businessId });
  if (sides.length === 0) throw ApiError.forbidden();
  return { OR: sides };
}

export async function listOrders(businessId: string, role: Role, side: "BUYER" | "SELLER") {
  const permission = side === "BUYER" ? "wholesale.buy" : "wholesale.sell";
  if (!hasPermission(role, permission)) throw ApiError.forbidden();
  const orders = await prisma.wholesaleOrder.findMany({
    where: side === "BUYER" ? { buyerBusinessId: businessId } : { sellerBusinessId: businessId },
    include: orderInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return orders.map((o) => serialize(o, businessId));
}

export async function getOrder(businessId: string, role: Role, id: string) {
  const order = await prisma.wholesaleOrder.findFirst({ where: { id, ...visibleWhere(businessId, role) }, include: orderInclude });
  if (!order) throw ApiError.notFound("Заказ табылган жок.");
  return serialize(order, businessId);
}

const SELLER_MOVES: Partial<Record<WholesaleOrderStatus, WholesaleOrderStatus[]>> = { NEW: ["ACCEPTED", "REJECTED"], ACCEPTED: ["SHIPPED", "REJECTED"] };
const BUYER_MOVES: Partial<Record<WholesaleOrderStatus, WholesaleOrderStatus[]>> = { NEW: ["CANCELLED"], ACCEPTED: ["CANCELLED"], SHIPPED: ["RECEIVED"] };

/**
 * Moves an order along. Optionally:
 * - seller, on SHIPPED: records the goods leaving as a wholesale sale in the seller's books;
 * - buyer, on RECEIVED: books the goods in as a purchase receipt (matched to the buyer's
 *   products by barcode), owed to the wholesaler as a supplier debt.
 */
export async function changeStatus(businessId: string, employeeId: string, role: Role, id: string, input: WholesaleStatusInput) {
  const order = await prisma.wholesaleOrder.findFirst({ where: { id, ...visibleWhere(businessId, role) }, include: orderInclude });
  if (!order) throw ApiError.notFound("Заказ табылган жок.");
  const isSeller = order.sellerBusinessId === businessId;
  const allowed = (isSeller ? SELLER_MOVES : BUYER_MOVES)[order.status] ?? [];
  if (!allowed.includes(input.status)) throw ApiError.badRequest("Заказдын абалын мындай өзгөртүүгө болбойт.");
  if (isSeller && !hasPermission(role, "wholesale.sell")) throw ApiError.forbidden();
  if (!isSeller && !hasPermission(role, "wholesale.buy")) throw ApiError.forbidden();

  let saleId: string | undefined;
  let receiptId: string | undefined;
  let unmatched: { name: string; barcode: string | null; quantity: number }[] = [];

  if (isSeller && input.status === "SHIPPED" && input.recordSale) {
    const sale = await createSale(businessId, employeeId, role, {
      items: order.items.map((i) => ({ productId: i.productId, quantity: toNumber(i.quantity) })),
      discount: 0,
      paymentMethod: input.paymentMethod ?? "CASH",
      customerId: null,
      locationId: null,
      priceLevel: "WHOLESALE",
      prescriptionConfirmed: true,
    });
    saleId = sale.id;
  }

  if (!isSeller && input.status === "RECEIVED" && input.createReceipt) {
    const barcodes = order.items.map((i) => i.barcode).filter((b): b is string => !!b);
    const mine = await prisma.product.findMany({ where: { businessId, status: "ACTIVE", barcode: { in: barcodes } } });
    const byBarcode = new Map(mine.map((p) => [p.barcode!, p]));
    const matched = order.items.filter((i) => i.barcode && byBarcode.has(i.barcode) && !byBarcode.get(i.barcode)!.requiresSerial);
    unmatched = order.items
      .filter((i) => !matched.includes(i))
      .map((i) => ({ name: i.name, barcode: i.barcode, quantity: toNumber(i.quantity) }));
    if (matched.length > 0) {
      const supplier =
        (await prisma.supplier.findFirst({ where: { businessId, name: order.sellerBusiness.name } })) ??
        (await prisma.supplier.create({ data: { businessId, name: order.sellerBusiness.name, phone: order.sellerBusiness.phone, address: order.sellerBusiness.address } }));
      const receipt = await createReceipt(
        businessId,
        employeeId,
        createReceiptSchema.parse({
          type: "PURCHASE",
          supplierId: supplier.id,
          comment: `Ainabi оптом: ${order.sellerBusiness.name}`,
          items: matched.map((i) => ({ productId: byBarcode.get(i.barcode!)!.id, quantity: toNumber(i.quantity), purchasePrice: toNumber(i.price) })),
          // Not paid at the till: it's owed to the wholesaler.
          paidAmount: 0,
          createSupplierDebt: true,
        }),
      );
      receiptId = receipt.id;
    }
  }

  const { count } = await prisma.wholesaleOrder.updateMany({
    where: { id, status: order.status },
    data: {
      status: input.status,
      ...(isSeller && input.note !== undefined ? { sellerNote: input.note || null } : {}),
      ...(saleId ? { saleId } : {}),
      ...(receiptId ? { receiptId } : {}),
    },
  });
  if (count === 0) throw ApiError.conflict("Заказды башка бирөө өзгөртүп койду. Баракты жаңыртыңыз.");
  return { order: await getOrder(businessId, role, id), unmatched };
}

/** New orders waiting for this wholesaler — for the badge. */
export async function incomingCount(businessId: string) {
  return prisma.wholesaleOrder.count({ where: { sellerBusinessId: businessId, status: "NEW" } });
}
