import { before, test } from "node:test";
import assert from "node:assert/strict";
import * as debts from "../../src/services/debt.service";
import * as currency from "../../src/services/currency.service";
import * as catalog from "../../src/services/catalog.service";
import * as wholesale from "../../src/services/wholesale.service";
import { buildRiskReport } from "../../src/services/risk.service";
import { createCustomer, updateCustomer } from "../../src/services/customer.service";
import { createReturn } from "../../src/services/sale.service";
import { createReturnSchema } from "../../src/validators/sale.validator";
import { createDebtSchema } from "../../src/validators/debt.validator";
import { customerSchema } from "../../src/validators/customer.validator";
import { createWholesaleOrderSchema, wholesaleStatusSchema } from "../../src/validators/wholesale.validator";
import { addMonthsToDay } from "../../src/services/installments";
import { dayKey } from "../../src/utils/dateRange";
import { newCustomer, newEmployee, newProduct, newShop, prisma, sell, Shop, stockOf } from "./helpers";

const today = dayKey(new Date());

before(async () => {
  // Today's bank rate is "already fetched", so no test goes to the network.
  await prisma.exchangeRate.upsert({ where: { day: today }, create: { day: today, usd: 87.45, nbkrDate: today }, update: {} });
});

// ---------- debts & installments ----------

test("installments: plan, overdue sum, reminder list, payments in date order", async () => {
  const shop = await newShop();
  const customer = await newCustomer(shop);
  const firstDueDate = addMonthsToDay(today, -2);
  const debt = await debts.createDebt(
    shop.businessId,
    createDebtSchema.parse({ customerId: customer.id, totalAmount: 10000, installments: { count: 4, firstDueDate } }),
  );
  let d = await debts.getDebt(shop.businessId, debt.id);
  assert.equal(d.schedule.length, 4);
  assert.equal(d.schedule.reduce((s, i) => s + i.amount, 0), 10000);
  assert.equal(d.overdueAmount, 5000);
  assert.equal((await debts.listReminders(shop.businessId)).length, 1);

  await debts.addPayment(shop.businessId, debt.id, { amount: 6000, method: "CASH" });
  d = await debts.getDebt(shop.businessId, debt.id);
  assert.equal(d.overdueAmount, 0);
  assert.equal(d.nextDueAmount, 1500);
  assert.equal(d.status, "PARTIAL");
  await assert.rejects(debts.addPayment(shop.businessId, debt.id, { amount: 4001, method: "CASH" }), /ашпашы керек/);
  await debts.addPayment(shop.businessId, debt.id, { amount: 4000, method: "CASH" });
  assert.equal((await debts.getDebt(shop.businessId, debt.id)).status, "PAID");
});

test("two payments at once can't overpay a debt", async () => {
  const shop = await newShop();
  const customer = await newCustomer(shop);
  const debt = await debts.createDebt(shop.businessId, createDebtSchema.parse({ customerId: customer.id, totalAmount: 100 }));
  const results = await Promise.allSettled([1, 2, 3].map(() => debts.addPayment(shop.businessId, debt.id, { amount: 60, method: "CASH" })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});

test("returned goods shrink the installment plan too, so nobody is reminded of too much", async () => {
  const shop = await newShop();
  const customer = await newCustomer(shop);
  const p = await newProduct(shop, { quantity: 10, salePrice: 3000 });
  const sale = await sell(shop, [{ productId: p.id, quantity: 3 }], { paymentMethod: "DEBT", customerId: customer.id });
  const debt = await prisma.debt.findFirstOrThrow({ where: { saleId: sale.id } });
  await debts.setSchedule(shop.businessId, debt.id, { installments: { count: 3, firstDueDate: addMonthsToDay(today, -3), intervalMonths: 1 } });
  await debts.addPayment(shop.businessId, debt.id, { amount: 4000, method: "CASH" });
  await createReturn(
    shop.businessId,
    shop.ownerId,
    sale.id,
    createReturnSchema.parse({ items: [{ saleItemId: sale.items[0].id, quantity: 1 }], refundMethod: "DEBT" }),
  );
  const d = await debts.getDebt(shop.businessId, debt.id);
  assert.equal(d.remainingAmount, 2000);
  assert.equal(d.overdueAmount, 2000);
  assert.equal(d.schedule.reduce((s, i) => s + i.amount, 0), 6000);
});

test("debts of another business are invisible", async () => {
  const shop = await newShop();
  const customer = await newCustomer(shop);
  const debt = await debts.createDebt(shop.businessId, createDebtSchema.parse({ customerId: customer.id, totalAmount: 100 }));
  const stranger = await newShop();
  await assert.rejects(debts.getDebt(stranger.businessId, debt.id), /табылган жок/);
  await assert.rejects(debts.addPayment(stranger.businessId, debt.id, { amount: 1, method: "CASH" }), /табылган жок/);
});

// ---------- dollar prices ----------

test("dollar prices: create, manual rate, rounding, whole and fractional rates", async () => {
  const shop = await newShop();
  const p = await newProduct(shop, { usdPurchasePrice: 80, usdSalePrice: 100 });
  assert.deepEqual([p.salePrice, p.purchasePrice], [8750, 6996]);
  const som = await newProduct(shop, { salePrice: 500 });

  const prices = async (id: string) => {
    const row = await prisma.product.findUniqueOrThrow({ where: { id } });
    return [Number(row.salePrice), Number(row.purchasePrice)];
  };
  await currency.updateCurrencySettings(shop.businessId, { usdRateAuto: false, usdRate: 88.37, priceRounding: 50 });
  assert.deepEqual(await prices(p.id), [8850, 7069.6]);
  await currency.updateCurrencySettings(shop.businessId, { usdRateAuto: false, usdRate: 90, priceRounding: 1 });
  assert.deepEqual(await prices(p.id), [9000, 7200]);
  assert.deepEqual(await prices(som.id), [500, 60]);
});

test("dollar prices follow the bank's rate once a day", async () => {
  const shop = await newShop();
  const p = await newProduct(shop, { usdPurchasePrice: 80, usdSalePrice: 100 });
  await prisma.business.update({ where: { id: shop.businessId }, data: { usdRateAuto: true, usdRate: 80, usdRateDate: "2026-01-01" } });
  await prisma.product.update({ where: { id: p.id }, data: { salePrice: 8000, purchasePrice: 6400 } });
  await Promise.all([1, 2, 3].map(() => currency.ensureFreshPrices(shop.businessId)));
  const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
  assert.deepEqual([Number(row.salePrice), Number(row.purchasePrice)], [8750, 6996]);
});

// ---------- public catalog ----------

test("catalog: shows only what's for sale and never leaks cost or stock", async () => {
  const shop = await newShop();
  const slug = `shop-${shop.businessId.slice(-8)}`;
  const on = { enabled: true, slug, whatsapp: "+996700000000", showStock: false, note: null };
  await assert.rejects(catalog.publicCatalog(slug, { page: 1 }), /табылган жок/);
  const shown = await newProduct(shop, { name: "Көрүнөт", salePrice: 100, purchasePrice: 61 });
  await newProduct(shop, { name: "Бүткөн", quantity: 0 });
  const archived = await newProduct(shop, { name: "Архив" });
  await prisma.product.update({ where: { id: archived.id }, data: { status: "ARCHIVED" } });
  const stage = await prisma.pipelineStage.create({ data: { businessId: shop.businessId, name: "Текшерүүдө", position: 1, blocksSale: true } });
  const blocked = await newProduct(shop, { name: "Текшерүүдөгү" });
  await prisma.product.update({ where: { id: blocked.id }, data: { stageId: stage.id } });
  await prisma.product.update({ where: { id: shown.id }, data: { stageId: null } });

  await catalog.updateCatalogSettings(shop.businessId, on);
  const page = await catalog.publicCatalog(slug.toUpperCase(), { page: 1 });
  assert.deepEqual(page.items.map((i) => i.name), ["Көрүнөт"]);
  assert.equal(page.items[0].quantity, null);
  assert.ok(!JSON.stringify(page).includes("61"), "no cost price anywhere");

  const other = await newShop();
  await assert.rejects(catalog.updateCatalogSettings(other.businessId, on), /бош эмес/);
  await catalog.updateCatalogSettings(shop.businessId, { ...on, enabled: false });
  await assert.rejects(catalog.publicCatalog(slug, { page: 1 }), /табылган жок/);
});

test("the catalog shows today's dollar price", async () => {
  const shop = await newShop();
  const slug = `usd-${shop.businessId.slice(-8)}`;
  const p = await newProduct(shop, { usdSalePrice: 100 });
  await catalog.updateCatalogSettings(shop.businessId, { enabled: true, slug, showStock: false });
  await prisma.business.update({ where: { id: shop.businessId }, data: { usdRateAuto: true, usdRate: 80, usdRateDate: "2026-01-01" } });
  await prisma.product.update({ where: { id: p.id }, data: { salePrice: 8000 } });
  const page = await catalog.publicCatalog(slug, { page: 1 });
  assert.equal(page.items[0].price, 8750);
});

// ---------- wholesale price at the till ----------

test("a cashier may use the wholesale price only for wholesale customers", async () => {
  const shop = await newShop({ maxDiscountPercent: 10 });
  const cashier = { id: await newEmployee(shop, "CASHIER"), role: "CASHIER" as const };
  const p = await newProduct(shop, { salePrice: 100, wholesalePrice: 70 });
  const walkIn = await newCustomer(shop);
  const trader = await newCustomer(shop, { isWholesale: true });
  const items = [{ productId: p.id, quantity: 1 }];

  await assert.rejects(sell(shop, items, { priceLevel: "WHOLESALE" }, cashier), /оптом/i);
  await assert.rejects(sell(shop, items, { priceLevel: "WHOLESALE", customerId: walkIn.id }, cashier), /оптом/i);
  assert.equal((await sell(shop, items, { priceLevel: "WHOLESALE", customerId: trader.id }, cashier)).total, 70);
  assert.equal((await sell(shop, items, { priceLevel: "WHOLESALE" })).total, 70); // the owner may
});

test("a cashier can't turn a customer into a wholesale one", async () => {
  const shop = await newShop();
  const input = (isWholesale: boolean) => customerSchema.parse({ name: "Кардар", isWholesale });
  const made = await createCustomer(shop.businessId, "CASHIER", input(true));
  assert.equal(made.isWholesale, false);
  assert.equal((await updateCustomer(shop.businessId, "CASHIER", made.id, input(true))).isWholesale, false);
  assert.equal((await updateCustomer(shop.businessId, "ADMIN", made.id, input(true))).isWholesale, true);
  // Editing the phone number later must not drop what the manager set.
  assert.equal((await updateCustomer(shop.businessId, "CASHIER", made.id, input(false))).isWholesale, true);
});

// ---------- wholesale network ----------

async function wholesaleSetup() {
  const seller = await newShop({ wholesaleEnabled: true });
  const buyer = await newShop();
  const code = `47${Date.now()}`.slice(0, 13);
  const goods = await newProduct(seller, { quantity: 10, wholesalePrice: 70, barcode: code });
  const mine = await newProduct(buyer, { quantity: 1, purchasePrice: 50, barcode: code });
  const place = (quantity: number, productId = goods.id) =>
    wholesale.createOrder(
      buyer.businessId,
      buyer.ownerId,
      createWholesaleOrderSchema.parse({ sellerBusinessId: seller.businessId, items: [{ productId, quantity }] }),
    );
  return { seller, buyer, goods, mine, place };
}
const move = (shop: Shop, id: string, body: Record<string, unknown>) =>
  wholesale.changeStatus(shop.businessId, shop.ownerId, "OWNER", id, wholesaleStatusSchema.parse(body));

test("wholesale order: the whole way, both books agree", async () => {
  const { seller, buyer, goods, mine, place } = await wholesaleSetup();
  const order = await place(4);
  assert.equal(order.total, 280);
  await assert.rejects(move(buyer, order.id, { status: "ACCEPTED" }), /болбойт/);
  await move(seller, order.id, { status: "ACCEPTED" });

  // The seller changes the price afterwards — the agreed one still holds.
  await prisma.product.update({ where: { id: goods.id }, data: { wholesalePrice: 90 } });
  const { order: shipped } = await move(seller, order.id, { status: "SHIPPED", recordSale: true, paymentMethod: "CASH" });
  const sale = await prisma.sale.findUniqueOrThrow({ where: { id: shipped.saleId! } });
  assert.equal(Number(sale.total), 280);
  assert.equal((await stockOf(goods.id)).total, 6);

  const { unmatched } = await move(buyer, order.id, { status: "RECEIVED", createReceipt: true });
  assert.equal(unmatched.length, 0);
  assert.equal((await stockOf(mine.id)).total, 5);
  const debt = await prisma.supplierDebt.findFirstOrThrow({ where: { businessId: buyer.businessId } });
  assert.equal(Number(debt.remainingAmount), 280);
  await assert.rejects(wholesale.getOrder((await newShop()).businessId, "OWNER", order.id), /табылган жок/);
});

test("wholesale: shipping or receiving twice at once books goods once", async () => {
  const { seller, buyer, goods, mine, place } = await wholesaleSetup();
  const order = await place(3);
  await move(seller, order.id, { status: "ACCEPTED" });
  const ship = () => move(seller, order.id, { status: "SHIPPED", recordSale: true });
  const shipped = await Promise.allSettled([ship(), ship(), ship()]);
  assert.equal(shipped.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await stockOf(goods.id)).total, 7);
  const receive = () => move(buyer, order.id, { status: "RECEIVED", createReceipt: true });
  await Promise.allSettled([receive(), receive(), receive()]);
  assert.equal((await stockOf(mine.id)).total, 4);
  assert.equal(await prisma.supplierDebt.count({ where: { businessId: buyer.businessId } }), 1);
});

test("wholesale: a failed sale leaves the order where it was", async () => {
  const { seller, goods, place } = await wholesaleSetup();
  const order = await place(4);
  await move(seller, order.id, { status: "ACCEPTED" });
  await sell(seller, [{ productId: goods.id, quantity: 8 }]);
  await assert.rejects(move(seller, order.id, { status: "SHIPPED", recordSale: true }), /жетишсиз/);
  assert.equal((await wholesale.getOrder(seller.businessId, "OWNER", order.id)).status, "ACCEPTED");
});

test("wholesale: goods that aren't for sale yet can't be ordered", async () => {
  const { seller, buyer, goods, place } = await wholesaleSetup();
  const stage = await prisma.pipelineStage.create({ data: { businessId: seller.businessId, name: "Текшерүүдө", position: 1, blocksSale: true } });
  await prisma.product.update({ where: { id: goods.id }, data: { stageId: stage.id } });
  assert.equal((await wholesale.listSupplierProducts(buyer.businessId, seller.businessId, { page: 1 })).items.length, 0);
  await assert.rejects(place(1), /жеткиликсиз/);
});

// ---------- till watch ----------

test("till watch names the seller behind max discounts, returns and losses", async () => {
  const shop = await newShop({ maxDiscountPercent: 10 });
  const cashier = { id: await newEmployee(shop, "CASHIER"), role: "CASHIER" as const };
  const p = await newProduct(shop, { quantity: 50, salePrice: 100, purchasePrice: 60 });
  const cheap = await newProduct(shop, { quantity: 5, salePrice: 40, purchasePrice: 60 });
  for (let i = 0; i < 3; i++) await sell(shop, [{ productId: p.id, quantity: 1 }], { discount: 10 }, cashier);
  await sell(shop, [{ productId: cheap.id, quantity: 1 }], {}, cashier);
  await sell(shop, [{ productId: p.id, quantity: 1 }]);

  const report = await buildRiskReport(shop.businessId, { preset: "today" });
  const who = report.people.find((x) => x.employeeId === cashier.id)!;
  const keys = who.signals.map((s) => s.key);
  assert.ok(keys.includes("maxedDiscounts") && keys.includes("belowCost"), keys.join());
  assert.ok(report.events.some((e) => e.type === "BELOW_COST" && e.amount === 20));
  const other = await buildRiskReport((await newShop()).businessId, { preset: "today" });
  assert.equal(other.people.length, 0);
});
