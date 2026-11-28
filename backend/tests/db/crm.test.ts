import { test } from "node:test";
import assert from "node:assert/strict";
import * as crm from "../../src/services/crm.service";
import { activitySchema, crmProfileSchema, segmentQuerySchema } from "../../src/validators/crm.validator";
import { newCustomer, newProduct, newShop, prisma, sell } from "./helpers";

const DAY = 86_400_000;
const segment = (businessId: string, q: Record<string, unknown>) => crm.listSegment(businessId, segmentQuerySchema.parse(q));

test("crm: segments come from the sales history", async () => {
  const shop = await newShop({ plan: "MAX" });
  const p = await newProduct(shop, { quantity: 100, salePrice: 1000 });
  const regular = await newCustomer(shop, { name: "Туруктуу" });
  const gone = await newCustomer(shop, { name: "Келбей калган" });
  const fresh = await newCustomer(shop, { name: "Жаңы" });
  const never = await newCustomer(shop, { name: "Сатып ала элек" });

  await sell(shop, [{ productId: p.id, quantity: 3 }], { customerId: regular.id });
  await sell(shop, [{ productId: p.id, quantity: 2 }], { customerId: regular.id });
  const old = await sell(shop, [{ productId: p.id, quantity: 4 }], { customerId: gone.id });
  // Move "gone"'s only purchase 45 days back and make the regular an old customer too.
  await prisma.sale.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 45 * DAY) } });
  const regularSales = await prisma.sale.findMany({ where: { customerId: regular.id }, orderBy: { createdAt: "asc" } });
  await prisma.sale.update({ where: { id: regularSales[0].id }, data: { createdAt: new Date(Date.now() - 90 * DAY) } });
  await sell(shop, [{ productId: p.id, quantity: 1 }], { customerId: fresh.id });

  const lapsed = await segment(shop.businessId, { segment: "lapsed", days: 30 });
  assert.deepEqual(lapsed.map((r) => r.name), ["Келбей калган"]);
  assert.equal(lapsed[0].daysSinceLastPurchase, 45);
  assert.equal(lapsed[0].averageCheck, 4000);

  const top = await segment(shop.businessId, { segment: "top" });
  assert.deepEqual(top.map((r) => r.name), ["Туруктуу", "Келбей калган", "Жаңы"]);
  assert.equal(top[0].purchaseCount, 2);
  assert.equal(top[0].totalSpent, 5000);

  const newcomers = await segment(shop.businessId, { segment: "newcomers" });
  assert.deepEqual(newcomers.map((r) => r.name), ["Жаңы"], "the regular's first purchase was 90 days ago");

  const overview = await crm.overview(shop.businessId, 30);
  assert.equal(overview.customers, 4);
  assert.equal(overview.buyers, 3);
  assert.equal(overview.repeatRate, 33);
  assert.equal(overview.segments.lapsed, 1);
  assert.ok((await segment(shop.businessId, { segment: "all" })).some((r) => r.id === never.id && r.purchaseCount === 0));
});

test("crm: tags are cleaned up and filter a segment; birthdays come round each year", async () => {
  const shop = await newShop({ plan: "MAX" });
  const a = await newCustomer(shop, { name: "А" });
  const b = await newCustomer(shop, { name: "Б" });
  const saved = await crm.updateProfile(shop.businessId, a.id, crmProfileSchema.parse({ tags: [" VIP ", "vip", "Оптовик", "  "] }));
  assert.deepEqual(saved.tags, ["VIP", "Оптовик"]);
  await crm.updateProfile(shop.businessId, b.id, crmProfileSchema.parse({ tags: ["оптовик"] }));

  const wholesale = await segment(shop.businessId, { segment: "tag", tag: "ОПТОВИК" });
  assert.deepEqual(wholesale.map((r) => r.name).sort(), ["А", "Б"]);
  const overview = await crm.overview(shop.businessId);
  assert.deepEqual(overview.tags.find((t) => t.tag === "Оптовик")?.count, 1);

  // Birthday in 3 days (any year) → in the birthdays segment; one far away is not.
  const soon = new Date(Date.now() + 3 * DAY);
  const iso = (d: Date) => `1990-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await crm.updateProfile(shop.businessId, a.id, crmProfileSchema.parse({ tags: ["VIP"], birthday: iso(soon) }));
  await crm.updateProfile(shop.businessId, b.id, crmProfileSchema.parse({ tags: [], birthday: iso(new Date(Date.now() + 100 * DAY)) }));
  const birthdays = await segment(shop.businessId, { segment: "birthdays" });
  assert.deepEqual(birthdays.map((r) => [r.name, r.daysToBirthday]), [["А", 3]]);

  await assert.rejects(crm.updateProfile(shop.businessId, a.id, crmProfileSchema.parse({ tags: [], birthday: "2990-01-01" })), /туура/);
  await assert.rejects(crm.updateProfile(shop.businessId, a.id, crmProfileSchema.parse({ tags: [], birthday: "1990-02-31" })), /туура/);
});

test("crm: daysToBirthday handles today, the year end and 29 February", () => {
  const now = new Date(2026, 11, 30, 15, 0); // 30 Dec 2026, afternoon
  assert.equal(crm.daysToBirthday(new Date("1990-12-30T00:00:00Z"), now), 0);
  assert.equal(crm.daysToBirthday(new Date("1990-01-02T00:00:00Z"), now), 3);
  assert.equal(crm.daysToBirthday(new Date("1992-02-29T00:00:00Z"), new Date(2027, 1, 27)), 1, "28 Feb in a non-leap year");
});

test("crm: notes, follow-ups due today/overdue, and closing them", async () => {
  const shop = await newShop({ plan: "MAX" });
  const c = await newCustomer(shop, { name: "Чалуу керек" });
  const other = await newShop({ plan: "MAX" });

  await crm.addActivity(shop.businessId, shop.ownerId, c.id, activitySchema.parse({ kind: "NOTE", text: "Кара түстү жактырат" }));
  const overdue = await crm.addActivity(shop.businessId, shop.ownerId, c.id, activitySchema.parse({ kind: "FOLLOW_UP", text: "Жаңы партия келгенде чалуу", dueAt: new Date(Date.now() - 2 * DAY) }));
  await crm.addActivity(shop.businessId, shop.ownerId, c.id, activitySchema.parse({ kind: "FOLLOW_UP", text: "Кийинки ай", dueAt: new Date(Date.now() + 20 * DAY) }));
  assert.throws(() => activitySchema.parse({ kind: "FOLLOW_UP", text: "күнү жок" }), /Качан/);

  const due = await crm.listFollowUps(shop.businessId, "due");
  assert.deepEqual(due.map((d) => [d.text, d.overdue, d.customerName]), [["Жаңы партия келгенде чалуу", true, "Чалуу керек"]]);
  assert.equal((await crm.listFollowUps(shop.businessId, "upcoming")).length, 2);
  assert.equal((await crm.overview(shop.businessId)).followUpsDue, 1);

  // Another business can't see or close it.
  await assert.rejects(crm.setFollowUpDone(other.businessId, overdue.id, true), /табылган жок/);
  await assert.rejects(crm.listActivities(other.businessId, c.id), /табылган жок/);

  const closed = await crm.setFollowUpDone(shop.businessId, overdue.id, true);
  assert.ok(closed.doneAt);
  assert.equal((await crm.listFollowUps(shop.businessId, "due")).length, 0);

  const timeline = await crm.listActivities(shop.businessId, c.id);
  assert.equal(timeline.items.length, 3);
  assert.equal(timeline.items[0].employeeName, "Ээси");
});
