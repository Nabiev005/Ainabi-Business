import { test } from "node:test";
import assert from "node:assert/strict";
import { createReturn } from "../../src/services/sale.service";
import * as reservations from "../../src/services/reservation.service";
import * as stock from "../../src/services/stock.service";
import { getCustomer } from "../../src/services/customer.service";
import { createReturnSchema } from "../../src/validators/sale.validator";
import { createReservationSchema } from "../../src/validators/reservation.validator";
import { createReceiptSchema } from "../../src/validators/stock.validator";
import { getDefaultLocation } from "../../src/utils/stockLedger";
import { newCustomer, newEmployee, newProduct, newShop, prisma, sell, Shop, stockOf } from "./helpers";

const balance = async (id: string) => Number((await prisma.customer.findUniqueOrThrow({ where: { id } })).bonusBalance);
const reserve = (shop: Shop, body: Record<string, unknown>) =>
  reservations.createReservation(shop.businessId, shop.ownerId, createReservationSchema.parse(body));
const freeAt = async (productId: string) => {
  const rows = await prisma.productStock.findMany({ where: { productId } });
  return rows.reduce((s, r) => s + Number(r.quantity) - Number(r.reserved), 0);
};

// ---------- loyalty bonus ----------

test("bonus: earned on what is paid, spent up to the cap, nothing when switched off", async () => {
  const shop = await newShop({ bonusEnabled: true, bonusPercent: 5, bonusMaxSpendPercent: 50 });
  const customer = await newCustomer(shop);
  const p = await newProduct(shop, { quantity: 50, salePrice: 1000 });

  const first = await sell(shop, [{ productId: p.id, quantity: 2 }], { customerId: customer.id, discount: 100 }); // pays 1900
  assert.equal(first.bonusEarned, 95);
  assert.equal(await balance(customer.id), 95);

  await assert.rejects(sell(shop, [{ productId: p.id, quantity: 1 }], { customerId: customer.id, bonusUsed: 96 }), /бонусу жетишсиз/);
  await assert.rejects(sell(shop, [{ productId: p.id, quantity: 1 }], { bonusUsed: 10 }), /кардарды тандаңыз/);
  const small = await newProduct(shop, { quantity: 5, salePrice: 100 });
  await assert.rejects(sell(shop, [{ productId: small.id, quantity: 1 }], { customerId: customer.id, bonusUsed: 60 }), /эң көп 50 сом/);

  const second = await sell(shop, [{ productId: p.id, quantity: 1 }], { customerId: customer.id, bonusUsed: 95 });
  assert.deepEqual([second.total, second.bonusUsed, second.bonusEarned], [905, 95, 45]);
  assert.equal(await balance(customer.id), 45);

  // On credit and at wholesale prices nothing is earned.
  assert.equal((await sell(shop, [{ productId: p.id, quantity: 1 }], { customerId: customer.id, paymentMethod: "DEBT" })).bonusEarned, 0);
  const history = (await getCustomer(shop.businessId, customer.id)).bonusHistory;
  assert.deepEqual(history.map((h) => h.type).sort(), ["EARN", "EARN", "SPEND"]);

  const off = await newShop();
  const c2 = await newCustomer(off);
  const p2 = await newProduct(off, { salePrice: 1000 });
  assert.equal((await sell(off, [{ productId: p2.id, quantity: 1 }], { customerId: c2.id })).bonusEarned, 0);
  await assert.rejects(sell(off, [{ productId: p2.id, quantity: 1 }], { customerId: c2.id, bonusUsed: 1 }), /кардарды тандаңыз/);
});

test("bonus: a Basic shop earns nothing even if switched on; an old Basic shop keeps it until its grace ends", async () => {
  const basic = await newShop({ plan: "BASIC", bonusEnabled: true, bonusPercent: 5 });
  const c = await newCustomer(basic);
  const p = await newProduct(basic, { quantity: 5, salePrice: 1000 });
  assert.equal((await sell(basic, [{ productId: p.id, quantity: 1 }], { customerId: c.id })).bonusEarned, 0);

  const old = await newShop({ plan: "BASIC", bonusEnabled: true, bonusPercent: 5, legacyFeaturesUntil: new Date(Date.now() + 86_400_000) });
  const c2 = await newCustomer(old);
  const p2 = await newProduct(old, { quantity: 5, salePrice: 1000 });
  assert.equal((await sell(old, [{ productId: p2.id, quantity: 1 }], { customerId: c2.id })).bonusEarned, 50);
});

test("bonus: two tills can't spend the same points", async () => {
  const shop = await newShop({ bonusEnabled: true, bonusPercent: 0 });
  const customer = await newCustomer(shop, { bonusBalance: 100 });
  const p = await newProduct(shop, { quantity: 10, salePrice: 1000 });
  const results = await Promise.allSettled([1, 2, 3].map(() => sell(shop, [{ productId: p.id, quantity: 1 }], { customerId: customer.id, bonusUsed: 100 })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await balance(customer.id), 0);
});

test("bonus: a return gives spent points back, takes earned ones away, refunds only money", async () => {
  const shop = await newShop({ bonusEnabled: true, bonusPercent: 10, bonusMaxSpendPercent: 50 });
  const customer = await newCustomer(shop, { bonusBalance: 200 });
  const p = await newProduct(shop, { quantity: 10, salePrice: 500 });
  const sale = await sell(shop, [{ productId: p.id, quantity: 2 }], { customerId: customer.id, bonusUsed: 200 }); // pays 800, earns 80
  assert.equal(await balance(customer.id), 80);

  const r = await createReturn(shop.businessId, shop.ownerId, sale.id, createReturnSchema.parse({ items: [{ saleItemId: sale.items[0].id, quantity: 1 }], refundMethod: "CASH" }));
  assert.equal(r.total, 400); // half of the 800 paid in money
  assert.equal(await balance(customer.id), 140); // 80 + 100 back − 40 earned
});

// ---------- reservations ----------

test("reservation: held goods can't be sold, written off or moved; selling the reservation can", async () => {
  const shop = await newShop();
  const cashier = { id: await newEmployee(shop, "CASHIER"), role: "CASHIER" as const };
  const customer = await newCustomer(shop);
  const p = await newProduct(shop, { quantity: 5 });

  const r = await reserve(shop, { customerId: customer.id, items: [{ productId: p.id, quantity: 3 }] });
  assert.equal(r.number, 1);
  assert.equal(r.customerName, "Кардар");
  assert.equal(await freeAt(p.id), 2);
  assert.equal((await stockOf(p.id)).total, 5, "stock itself doesn't move");

  await assert.rejects(sell(shop, [{ productId: p.id, quantity: 3 }], {}, cashier), /жетишсиз \(калдык: 2\)/);
  await assert.rejects(
    stock.createMovement(shop.businessId, shop.ownerId, { productId: p.id, type: "WRITE_OFF", quantity: 3 }),
    /жетишсиз/,
  );
  await assert.rejects(reserve(shop, { customerName: "Башка", items: [{ productId: p.id, quantity: 3 }] }), /калдык: 2/);

  const sale = await sell(shop, [{ productId: p.id, quantity: 3 }], { reservationId: r.id, customerId: customer.id }, cashier);
  const done = await reservations.getReservation(shop.businessId, r.id);
  assert.deepEqual([done.status, done.saleId], ["COMPLETED", sale.id]);
  assert.deepEqual([(await stockOf(p.id)).total, await freeAt(p.id)], [2, 2]);
  await assert.rejects(sell(shop, [{ productId: p.id, quantity: 1 }], { reservationId: r.id }), /мурунтан сатылган/);
});

test("reservation: cancel and expiry give goods back; two shops can't hold the last unit", async () => {
  const shop = await newShop();
  const p = await newProduct(shop, { quantity: 4 });
  const r = await reserve(shop, { customerName: "Айгүл", phone: "0700 123 456", items: [{ productId: p.id, quantity: 4 }] });
  await reservations.cancelReservation(shop.businessId, r.id);
  assert.equal(await freeAt(p.id), 4);
  await assert.rejects(reservations.cancelReservation(shop.businessId, r.id), /жабылган/);

  const old = await reserve(shop, { customerName: "Мурунку", items: [{ productId: p.id, quantity: 4 }] });
  await prisma.reservation.update({ where: { id: old.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await reservations.listReservations(shop.businessId, "ACTIVE")).length, 0);
  assert.equal((await reservations.getReservation(shop.businessId, old.id)).status, "EXPIRED");
  assert.equal(await freeAt(p.id), 4);

  const results = await Promise.allSettled([1, 2, 3].map((i) => reserve(shop, { customerName: `К${i}`, items: [{ productId: p.id, quantity: 3 }] })));
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await freeAt(p.id), 1);
  await assert.rejects(reservations.getReservation((await newShop()).businessId, old.id), /табылган жок/);
});

test("reservation: an expired hold stops blocking the till even before anyone opens the list", async () => {
  const shop = await newShop();
  const p = await newProduct(shop, { quantity: 1 });
  const r = await reserve(shop, { customerName: "Эртең", items: [{ productId: p.id, quantity: 1 }] });
  await prisma.reservation.update({ where: { id: r.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await sell(shop, [{ productId: p.id, quantity: 1 }])).total, 100);
});

test("reservation: needs a customer, refuses other shops' products and zero quantities", async () => {
  const shop = await newShop();
  const p = await newProduct(shop);
  await assert.rejects(reserve(shop, { items: [{ productId: p.id, quantity: 1 }] }), /атын жазыңыз/);
  await assert.rejects(reserve(shop, { customerName: "А", items: [{ productId: (await newProduct(await newShop())).id, quantity: 1 }] }), /табылган жок/);
  assert.throws(() => createReservationSchema.parse({ customerName: "А", items: [{ productId: p.id, quantity: 0 }] }));
  const loc = await getDefaultLocation(prisma, shop.businessId);
  const r = await reserve(shop, { customerName: "А", expiresInDays: 0, items: [{ productId: p.id, quantity: 1 }, { productId: p.id, quantity: 2 }] });
  assert.deepEqual([r.items.length, r.items[0].quantity, r.expiresAt, r.locationId], [1, 3, null, loc.id]);
});

// ---------- order from suppliers ----------

test("reorder: running-low goods come with a quantity and the supplier they were last bought from", async () => {
  const shop = await newShop();
  const supplier = await prisma.supplier.create({ data: { businessId: shop.businessId, name: "Оптом Ош", phone: "0555 111 222" } });
  const tea = await newProduct(shop, { name: "Чай", quantity: 0, minQuantity: 5 });
  await stock.createReceipt(shop.businessId, shop.ownerId, createReceiptSchema.parse({ supplierId: supplier.id, items: [{ productId: tea.id, quantity: 20, purchasePrice: 50 }], paidAmount: 1000 }));
  await sell(shop, [{ productId: tea.id, quantity: 14 }]); // 1 a day over 14 days, 6 left
  const plenty = await newProduct(shop, { name: "Көп", quantity: 500 });

  const list = await stock.getReorderSuggestions(shop.businessId);
  const row = list.find((x) => x.productId === tea.id)!;
  assert.ok(row, "tea is suggested");
  assert.equal(row.daysUntilStockout, 6);
  assert.equal(row.suggestedQuantity, 8); // two weeks (14) − 6 on hand
  assert.deepEqual(row.supplier, { id: supplier.id, name: "Оптом Ош", phone: "0555 111 222" });
  assert.ok(!list.some((x) => x.productId === plenty.id));

  const belowMin = await newProduct(shop, { name: "Аз", quantity: 2, minQuantity: 5 });
  const row2 = (await stock.getReorderSuggestions(shop.businessId)).find((x) => x.productId === belowMin.id)!;
  assert.deepEqual([row2.suggestedQuantity, row2.supplier], [8, null]);
});
