import { test } from "node:test";
import assert from "node:assert/strict";
import { createReturn } from "../../src/services/sale.service";
import { addPayment, getDebt } from "../../src/services/debt.service";
import * as productService from "../../src/services/product.service";
import * as stock from "../../src/services/stock.service";
import { createReturnSchema } from "../../src/validators/sale.validator";
import { createReceiptSchema } from "../../src/validators/stock.validator";
import { productSchema } from "../../src/validators/product.validator";
import { getDefaultLocation } from "../../src/utils/stockLedger";
import { newCustomer, newEmployee, newProduct, newShop, prisma, sell, Shop, stockOf } from "./helpers";

const ret = (shop: Shop, saleId: string, body: Record<string, unknown>) =>
  createReturn(shop.businessId, shop.ownerId, saleId, createReturnSchema.parse(body));

// ---------- sales & stock ----------

test("a sale takes stock, keeps totals in step and records money and cost", async () => {
  const shop = await newShop();
  const p = await newProduct(shop, { quantity: 10, purchasePrice: 60, salePrice: 100 });
  const sale = await sell(shop, [{ productId: p.id, quantity: 3 }], { discount: 30 });
  assert.equal(sale.total, 270);
  const row = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
  assert.equal(Number(row.costTotal), 180);
  const s = await stockOf(p.id);
  assert.deepEqual([s.total, s.byLocation], [7, 7]);
  assert.equal(await prisma.stockMovement.count({ where: { saleId: sale.id, type: "SALE" } }), 1);
});

test("selling more than there is fails and changes nothing", async () => {
  const shop = await newShop();
  const a = await newProduct(shop, { quantity: 5 });
  const b = await newProduct(shop, { quantity: 1 });
  await assert.rejects(
    sell(shop, [
      { productId: a.id, quantity: 2 },
      { productId: b.id, quantity: 2 },
    ]),
    /складда жетишсиз/,
  );
  assert.equal((await stockOf(a.id)).total, 5);
  assert.equal(await prisma.sale.count({ where: { businessId: shop.businessId } }), 0);
});

test("two tills can't both sell the last unit", async () => {
  const shop = await newShop();
  const p = await newProduct(shop, { quantity: 1 });
  const results = await Promise.allSettled([1, 2, 3, 4].map(() => sell(shop, [{ productId: p.id, quantity: 1 }])));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await stockOf(p.id)).total, 0);
});

test("packages sell by their factor and price", async () => {
  const shop = await newShop();
  const p = await newProduct(shop, { quantity: 20, salePrice: 10, packages: [{ name: "Блок", factor: 10, salePrice: 90 }] });
  const sale = await sell(shop, [{ productId: p.id, quantity: 1, packageId: p.packages[0].id }]);
  assert.equal(sale.total, 90);
  assert.equal((await stockOf(p.id)).total, 10);
});

test("another business's product can't be sold", async () => {
  const mine = await newShop();
  const p = await newProduct(await newShop());
  await assert.rejects(sell(mine, [{ productId: p.id, quantity: 1 }]), /табылган жок/);
});

test("batches go out earliest expiry first", async () => {
  const shop = await newShop({ trackExpiry: true });
  const p = await newProduct(shop, { quantity: 5, initialExpiryDate: "2027-06-01", initialBatchNumber: "late" });
  await stock.createReceipt(
    shop.businessId,
    shop.ownerId,
    createReceiptSchema.parse({ items: [{ productId: p.id, quantity: 5, purchasePrice: 60, expiryDate: "2027-01-01", batchNumber: "early" }] }),
  );
  await sell(shop, [{ productId: p.id, quantity: 6 }]);
  assert.deepEqual((await stockOf(p.id)).batches, [4, 0]); // late, early
});

test("a cashier's discount is capped, the owner's isn't", async () => {
  const shop = await newShop({ maxDiscountPercent: 10 });
  const cashier = { id: await newEmployee(shop, "CASHIER"), role: "CASHIER" as const };
  const p = await newProduct(shop, { salePrice: 100 });
  await assert.rejects(sell(shop, [{ productId: p.id, quantity: 1 }], { discount: 11 }, cashier), /лимиттен ашты/);
  assert.equal((await sell(shop, [{ productId: p.id, quantity: 1 }], { discount: 10 }, cashier)).total, 90);
  assert.equal((await sell(shop, [{ productId: p.id, quantity: 1 }], { discount: 50 })).total, 50);
});

test("with requireShift, no open shift means no sale", async () => {
  const shop = await newShop({ requireShift: true });
  const p = await newProduct(shop);
  await assert.rejects(sell(shop, [{ productId: p.id, quantity: 1 }]), /сменаны ачыңыз/);
});

// ---------- serials ----------

test("serials: registered in the form, demanded at the till, never sold twice", async () => {
  const shop = await newShop({ trackSerials: true });
  const p = await newProduct(shop, { quantity: 3, serialNumbers: [" sn1 ", "SN2"] });
  assert.equal(p.requiresSerial, true);
  await assert.rejects(sell(shop, [{ productId: p.id, quantity: 1 }]), /номер жазыңыз/);
  const sale = await sell(shop, [{ productId: p.id, quantity: 1, serialNumbers: ["sn1"] }]);
  await assert.rejects(sell(shop, [{ productId: p.id, quantity: 1, serialNumbers: ["SN1"] }]), /мурун сатылган/);

  const item = { saleItemId: sale.items[0].id, quantity: 1 };
  await assert.rejects(ret(shop, sale.id, { items: [item], refundMethod: "CASH" }), /номерлерди тандаңыз/);
  await ret(shop, sale.id, { items: [{ ...item, serialNumbers: ["SN1"] }], refundMethod: "CASH" });
  assert.equal((await sell(shop, [{ productId: p.id, quantity: 1, serialNumbers: ["SN1"] }])).total, 100);
});

test("serials: no more than the stock, no repeats in the shop, only one's own can be deleted", async () => {
  const shop = await newShop({ trackSerials: true });
  const other = await newShop({ trackSerials: true });
  await assert.rejects(newProduct(shop, { quantity: 1, serialNumbers: ["A", "B"] }), /көп/);
  const p = await newProduct(shop, { quantity: 2, serialNumbers: ["A"] });
  await assert.rejects(newProduct(shop, { quantity: 1, serialNumbers: ["a"] }), /складда бар/);
  await newProduct(other, { quantity: 1, serialNumbers: ["A"] });

  const body = (serialNumbers: string[]) =>
    productSchema.parse({ name: p.name, purchasePrice: 60, salePrice: 100, requiresSerial: true, serialNumbers });
  await productService.updateProduct(shop.businessId, p.id, body(["B"]));
  await assert.rejects(productService.updateProduct(shop.businessId, p.id, body(["C"])), /көп/);
  const [unit] = await productService.listSerials(shop.businessId, p.id, "IN_STOCK");
  await assert.rejects(productService.deleteSerial(other.businessId, p.id, unit.id), /табылган жок/);
  await productService.deleteSerial(shop.businessId, p.id, unit.id);
  assert.equal((await productService.listSerials(shop.businessId, p.id, "IN_STOCK")).length, 1);
});

// ---------- returns ----------

test("a return puts stock back and refunds what was really paid", async () => {
  const shop = await newShop();
  const p = await newProduct(shop, { quantity: 10, salePrice: 100 });
  const sale = await sell(shop, [{ productId: p.id, quantity: 4 }], { discount: 40 }); // 360 paid
  const item = sale.items[0].id;
  const r = await ret(shop, sale.id, { items: [{ saleItemId: item, quantity: 1 }], refundMethod: "CASH" });
  assert.equal(r.total, 90);
  assert.equal((await stockOf(p.id)).total, 7);
  await assert.rejects(ret(shop, sale.id, { items: [{ saleItemId: item, quantity: 4 }], refundMethod: "CASH" }), /кайтарууга болот: 3/);
});

test("the same line can't be returned twice at once", async () => {
  const shop = await newShop();
  const p = await newProduct(shop, { quantity: 1 });
  const sale = await sell(shop, [{ productId: p.id, quantity: 1 }]);
  const body = { items: [{ saleItemId: sale.items[0].id, quantity: 1 }], refundMethod: "CASH" };
  const results = await Promise.allSettled([ret(shop, sale.id, body), ret(shop, sale.id, body)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await stockOf(p.id)).total, 1);
});

test("returning an unpaid credit sale reduces the debt, it doesn't hand out cash", async () => {
  const shop = await newShop();
  const customer = await newCustomer(shop);
  const p = await newProduct(shop, { quantity: 10, salePrice: 100 });
  const sale = await sell(shop, [{ productId: p.id, quantity: 5 }], { paymentMethod: "DEBT", customerId: customer.id });
  const item = { saleItemId: sale.items[0].id, quantity: 1 };
  // Nothing has been paid yet, so there is no money to give back.
  await assert.rejects(ret(shop, sale.id, { items: [item], refundMethod: "CASH" }), /төлөнгөн/);

  await ret(shop, sale.id, { items: [item], refundMethod: "DEBT" });
  const debt = await prisma.debt.findFirstOrThrow({ where: { saleId: sale.id } });
  assert.deepEqual([Number(debt.totalAmount), Number(debt.remainingAmount), debt.status], [400, 400, "OPEN"]);

  // Once paid off, the money does go back — but never more than was paid in.
  await addPayment(shop.businessId, debt.id, { amount: 400, method: "CASH" });
  assert.equal((await ret(shop, sale.id, { items: [{ ...item, quantity: 4 }], refundMethod: "CASH" })).total, 400);
});

test("a debt return and a payment at the same moment both count", async () => {
  const shop = await newShop();
  const customer = await newCustomer(shop);
  const p = await newProduct(shop, { quantity: 40, salePrice: 100 });
  for (let i = 0; i < 8; i++) {
    const sale = await sell(shop, [{ productId: p.id, quantity: 2 }], { paymentMethod: "DEBT", customerId: customer.id });
    const debt = await prisma.debt.findFirstOrThrow({ where: { saleId: sale.id } });
    await Promise.all([
      ret(shop, sale.id, { items: [{ saleItemId: sale.items[0].id, quantity: 1 }], refundMethod: "DEBT" }),
      addPayment(shop.businessId, debt.id, { amount: 50, method: "CASH" }),
    ]);
    const now = await getDebt(shop.businessId, debt.id);
    assert.deepEqual([now.totalAmount, now.paidAmount, now.remainingAmount, now.status], [100, 50, 50, "PARTIAL"]);
  }
});

// ---------- receipts, write-offs, transfers, inventory ----------

test("a receipt adds stock, updates cost and leaves the unpaid part as supplier debt", async () => {
  const shop = await newShop();
  const supplier = await prisma.supplier.create({ data: { businessId: shop.businessId, name: "Оптомчу" } });
  const p = await newProduct(shop, { quantity: 1, purchasePrice: 60 });
  await stock.createReceipt(
    shop.businessId,
    shop.ownerId,
    createReceiptSchema.parse({ supplierId: supplier.id, items: [{ productId: p.id, quantity: 10, purchasePrice: 70 }], paidAmount: 200 }),
  );
  assert.equal((await stockOf(p.id)).total, 11);
  assert.equal(Number((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).purchasePrice), 70);
  const debt = await prisma.supplierDebt.findFirstOrThrow({ where: { supplierId: supplier.id } });
  assert.equal(Number(debt.remainingAmount), 500);
});

test("a write-off can't go below zero", async () => {
  const shop = await newShop();
  const p = await newProduct(shop, { quantity: 2 });
  const out = (quantity: number) => stock.createMovement(shop.businessId, shop.ownerId, { productId: p.id, type: "WRITE_OFF", quantity });
  await assert.rejects(out(3), /жетишсиз/);
  await out(2);
  assert.equal((await stockOf(p.id)).total, 0);
});

test("a transfer moves stock between branches without changing the total", async () => {
  const shop = await newShop();
  const p = await newProduct(shop, { quantity: 10 });
  const from = await getDefaultLocation(prisma, shop.businessId);
  const to = await prisma.location.create({ data: { businessId: shop.businessId, name: "Экинчи" } });
  const move = (quantity: number) =>
    stock.createTransfer(shop.businessId, shop.ownerId, { fromLocationId: from.id, toLocationId: to.id, items: [{ productId: p.id, quantity }] });
  await move(4);
  await assert.rejects(move(7), /жетишсиз/);
  const s = await stockOf(p.id);
  assert.deepEqual([s.total, s.byLocation], [10, 10]);
  await assert.rejects(sell(shop, [{ productId: p.id, quantity: 5 }], { locationId: to.id }), /жетишсиз/);
  await sell(shop, [{ productId: p.id, quantity: 4 }], { locationId: to.id });
});

test("an inventory count sets stock to what was counted and values the shortage", async () => {
  const shop = await newShop();
  const p = await newProduct(shop, { quantity: 10, purchasePrice: 60 });
  const count = await stock.createInventoryCount(shop.businessId, shop.ownerId, { items: [{ productId: p.id, countedQty: 7 }] });
  assert.equal(count.shortageValue, 180);
  const s = await stockOf(p.id);
  assert.deepEqual([s.total, s.byLocation], [7, 7]);
});
