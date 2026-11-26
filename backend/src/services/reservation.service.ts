import { Prisma, ReservationStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { round2, toNumber } from "../utils/money";
import { changeReserved, Db, nextNumber, resolveLocationId } from "../utils/stockLedger";
import type { CreateReservationInput } from "../validators/reservation.validator";

/**
 * Reservations (буйрутма / резерв): goods held for a customer who pays and
 * takes them later. Holding raises ProductStock.reserved, so the till, a
 * write-off or a transfer can't take them; selling, cancelling or expiry
 * gives them back.
 */

const include = {
  items: { include: { product: { select: { id: true, name: true, unit: true, salePrice: true } } } },
  customer: { select: { id: true, name: true, phone: true } },
  employee: { select: { user: { select: { name: true } } } },
} satisfies Prisma.ReservationInclude;
type ReservationRow = Prisma.ReservationGetPayload<{ include: typeof include }>;

function serialize(r: ReservationRow, locationNames: Map<string, string>) {
  const items = r.items.map((i) => ({
    productId: i.productId,
    name: i.product.name,
    unit: i.product.unit,
    quantity: toNumber(i.quantity),
    price: toNumber(i.product.salePrice),
  }));
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    customerId: r.customerId,
    customerName: r.customer?.name ?? r.customerName,
    phone: r.phone ?? r.customer?.phone ?? null,
    locationId: r.locationId,
    locationName: locationNames.get(r.locationId) ?? null,
    employeeName: r.employee.user.name,
    note: r.note,
    expiresAt: r.expiresAt,
    saleId: r.saleId,
    createdAt: r.createdAt,
    items,
    total: round2(items.reduce((s, i) => s + i.quantity * i.price, 0)),
  };
}

async function locationNames(businessId: string) {
  const rows = await prisma.location.findMany({ where: { businessId }, select: { id: true, name: true } });
  return new Map(rows.map((l) => [l.id, l.name]));
}

/** Closes an active reservation and gives its goods back. False if it was no longer active. */
async function close(db: Db, r: { id: string; businessId: string; locationId: string; items: { productId: string; quantity: Prisma.Decimal }[] }, status: ReservationStatus) {
  const { count } = await db.reservation.updateMany({ where: { id: r.id, status: "ACTIVE" }, data: { status } });
  if (count === 0) return false;
  for (const item of r.items) {
    await changeReserved(db, { businessId: r.businessId, productId: item.productId, locationId: r.locationId, delta: -toNumber(item.quantity) });
  }
  return true;
}

/** Reservations past their date stop holding goods. Run lazily before anything reads or sells stock. */
export async function expireDue(businessId: string) {
  const due = await prisma.reservation.findMany({
    where: { businessId, status: "ACTIVE", expiresAt: { lt: new Date() } },
    include: { items: true },
  });
  for (const r of due) await prisma.$transaction((tx) => close(tx, r, "EXPIRED"));
}

export async function createReservation(businessId: string, employeeId: string, input: CreateReservationInput) {
  // One line per product, so holding and releasing stay simple.
  const quantities = new Map<string, number>();
  for (const item of input.items) quantities.set(item.productId, round2((quantities.get(item.productId) ?? 0) + item.quantity));

  const products = await prisma.product.findMany({ where: { businessId, id: { in: [...quantities.keys()] }, status: "ACTIVE" } });
  if (products.length !== quantities.size) throw ApiError.badRequest("Тандалган товарлардын айрымдары табылган жок.");

  const customer = input.customerId ? await prisma.customer.findFirst({ where: { id: input.customerId, businessId } }) : null;
  if (input.customerId && !customer) throw ApiError.notFound("Кардар табылган жок.");
  const customerName = input.customerName?.trim() || customer?.name;
  if (!customerName) throw ApiError.badRequest("Кардардын атын жазыңыз же кардарды тандаңыз.");

  await expireDue(businessId);
  const days = input.expiresInDays;
  const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000) : null;

  const created = await prisma.$transaction(async (tx) => {
    const locationId = await resolveLocationId(tx, businessId, { locationId: input.locationId, employeeId });
    for (const [productId, quantity] of quantities) {
      await changeReserved(tx, { businessId, productId, locationId, delta: quantity });
    }
    return tx.reservation.create({
      data: {
        businessId,
        number: await nextNumber(tx, businessId, "reservationCounter"),
        customerId: customer?.id ?? null,
        customerName,
        phone: input.phone?.trim() || customer?.phone || null,
        locationId,
        employeeId,
        note: input.note?.trim() || null,
        expiresAt,
        items: { create: [...quantities].map(([productId, quantity]) => ({ productId, quantity })) },
      },
    });
  });
  return getReservation(businessId, created.id);
}

export async function listReservations(businessId: string, status: "ACTIVE" | "ALL") {
  await expireDue(businessId);
  const [rows, names] = await Promise.all([
    prisma.reservation.findMany({
      where: { businessId, ...(status === "ACTIVE" ? { status: "ACTIVE" } : {}) },
      include,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    locationNames(businessId),
  ]);
  return rows.map((r) => serialize(r, names));
}

export async function getReservation(businessId: string, id: string) {
  const r = await prisma.reservation.findFirst({ where: { id, businessId }, include });
  if (!r) throw ApiError.notFound("Резерв табылган жок.");
  return serialize(r, await locationNames(businessId));
}

export async function cancelReservation(businessId: string, id: string) {
  const r = await prisma.reservation.findFirst({ where: { id, businessId }, include: { items: true } });
  if (!r) throw ApiError.notFound("Резерв табылган жок.");
  const closed = await prisma.$transaction((tx) => close(tx, r, "CANCELLED"));
  if (!closed) throw ApiError.conflict("Бул резерв мурунтан сатылган же жабылган.");
  return getReservation(businessId, id);
}

/** Inside the sale's transaction: the reservation is used up and its goods
 * become sellable again — the sale then takes them as usual. */
export async function consumeForSale(tx: Db, businessId: string, reservationId: string) {
  const r = await tx.reservation.findFirst({ where: { id: reservationId, businessId }, include: { items: true } });
  if (!r) throw ApiError.notFound("Резерв табылган жок.");
  if (!(await close(tx, r, "COMPLETED"))) throw ApiError.conflict("Бул резерв мурунтан сатылган же жабылган.");
  return r;
}
