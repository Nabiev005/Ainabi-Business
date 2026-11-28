import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { env } from "../../src/config/env";
import * as auth from "../../src/services/auth.service";
import * as verification from "../../src/services/emailVerification.service";
import * as billing from "../../src/services/billing.service";
import * as productService from "../../src/services/product.service";
import * as catalog from "../../src/services/catalog.service";
import { registerSchema } from "../../src/validators/auth.validator";
import { newProduct, newShop, prisma, sell } from "./helpers";

const DAY = 86_400_000;
const daysUntil = (d: Date | null) => (d ? Math.round((d.getTime() - Date.now()) / DAY) : null);
let counter = 0;
const signUp = () =>
  auth.register(
    registerSchema.parse({
      name: "Жаңы Ээси",
      email: `owner${process.pid}-${++counter}@test.kg`,
      password: "strong-password-1",
      businessName: "Жаңы дүкөн",
      phone: "+996700000001",
      businessType: "GENERAL",
    }),
  );

// ---------- email confirmation ----------

const sent: { to: string; text: string }[] = [];
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    if (String(url).includes("api.resend.com")) {
      const body = JSON.parse(init?.body ?? "{}");
      sent.push({ to: body.to[0], text: body.text });
      return new Response("{}", { status: 200 });
    }
    return realFetch(url as string, init as RequestInit);
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
});

test("without email on the server, a sign-up counts as confirmed and gets the full trial", async () => {
  const { session } = await signUp();
  assert.equal(session.user.emailVerified, true);
  assert.equal(daysUntil(session.subscription.expiresAt), 14);
});

test("with email on: short trial, a link, and confirming gives the full trial once", async () => {
  env.mail.resendApiKey = "test-key";
  env.mail.from = "Ainabi <no-reply@test.kg>";
  try {
    const { session } = await signUp();
    assert.equal(session.user.emailVerified, false);
    assert.equal(daysUntil(session.subscription.expiresAt), 3);

    const mail = sent.find((m) => m.to === session.user.email)!;
    assert.ok(mail, "a confirmation email went out");
    const token = /verify-email\?token=([\w-]+)/.exec(mail.text)![1];

    await assert.rejects(verification.resendVerification(session.user.id), /жаңы эле жөнөтүлдү/);
    await verification.verifyEmail(token);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
    assert.ok(user.emailVerifiedAt);
    const business = await prisma.business.findUniqueOrThrow({ where: { id: session.business.id } });
    assert.equal(daysUntil(business.planExpiresAt), 14);
    await assert.rejects(verification.verifyEmail(token), /мурун колдонулган/);
    assert.deepEqual(await verification.resendVerification(session.user.id), { alreadyVerified: true });
    await assert.rejects(verification.verifyEmail("not-a-real-token-at-all"), /мурун колдонулган/);
  } finally {
    env.mail.resendApiKey = "";
    env.mail.from = "";
  }
});

test("confirming never shortens a trial that was already extended or paid", async () => {
  const shop = await newShop({ isTrial: true, planExpiresAt: new Date(Date.now() + 40 * DAY) });
  const owner = await prisma.business.findUniqueOrThrow({ where: { id: shop.businessId } });
  await prisma.user.update({ where: { id: owner.ownerId }, data: { emailVerifiedAt: null } });
  const { createHash } = await import("crypto");
  await prisma.emailVerificationToken.create({
    data: { userId: owner.ownerId, tokenHash: createHash("sha256").update("tok-123456789").digest("hex"), expiresAt: new Date(Date.now() + DAY) },
  });
  await verification.verifyEmail("tok-123456789");
  const after = await prisma.business.findUniqueOrThrow({ where: { id: shop.businessId } });
  assert.equal(daysUntil(after.planExpiresAt), 40);
});

// ---------- platform overview ----------

test("health: by the last sale", () => {
  const now = Date.now();
  const ago = (d: number) => new Date(now - d * DAY);
  assert.equal(billing.healthOf(ago(1), null, now), "NEW");
  assert.equal(billing.healthOf(ago(10), null, now), "INACTIVE");
  assert.equal(billing.healthOf(ago(30), ago(2), now), "ACTIVE");
  assert.equal(billing.healthOf(ago(30), ago(10), now), "SLOWING");
  assert.equal(billing.healthOf(ago(60), ago(20), now), "INACTIVE");
});

test("overview: paying shops, monthly revenue, who runs out and who went quiet", async () => {
  const busy = await newShop({ isTrial: false, plan: "MAX", planExpiresAt: new Date(Date.now() + 3 * DAY) });
  const p = await newProduct(busy);
  await sell(busy, [{ productId: p.id, quantity: 1 }]);
  await sell(busy, [{ productId: p.id, quantity: 1 }]);
  const quiet = await newShop({ isTrial: false, plan: "BASIC", planExpiresAt: new Date(Date.now() + 20 * DAY), createdAt: new Date(Date.now() - 40 * DAY) });
  const q = await newProduct(quiet);
  const old = await sell(quiet, [{ productId: q.id, quantity: 1 }]);
  await prisma.sale.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 20 * DAY) } });
  const owner = (await prisma.business.findUniqueOrThrow({ where: { id: busy.businessId } })).ownerId;
  await prisma.subscriptionPayment.create({
    data: { businessId: busy.businessId, plan: "MAX", months: 1, amount: 3490, periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * DAY), recordedById: owner },
  });

  const o = await billing.platformOverview();
  assert.ok(o.totals.paying >= 2);
  assert.ok(o.mrr >= 3490 + 990);
  assert.ok(o.revenueByMonth.at(-1)!.amount >= 3490);
  assert.equal(o.revenueByMonth.length, 6);
  assert.ok(o.expiringSoon.some((b) => b.id === busy.businessId && b.daysLeft <= 3));
  assert.ok(!o.expiringSoon.some((b) => b.id === quiet.businessId));
  assert.ok(o.atRisk.some((b) => b.id === quiet.businessId));
  assert.ok(!o.atRisk.some((b) => b.id === busy.businessId));
  assert.equal(o.mostActive.find((b) => b.id === busy.businessId)?.sales30d, 2);

  const row = (await billing.listAllBusinesses(busy.businessId)).find((b) => b.id === busy.businessId)!;
  assert.deepEqual([row.sales7d, row.sales30d, row.health], [2, 2, "ACTIVE"]);
});

// ---------- IMEI / serial at the till ----------

test("scanning or searching a unit's IMEI finds its product, with the number ready", async () => {
  const shop = await newShop({ trackSerials: true });
  const phone = await newProduct(shop, { name: "iPhone 15", quantity: 2, serialNumbers: ["356938035643809", "SN-B"] });
  const scanned = await productService.findByBarcode(shop.businessId, "356938035643809");
  assert.equal(scanned.id, phone.id);
  assert.equal(scanned.scan?.serial, "356938035643809");
  assert.equal((await productService.findByBarcode(shop.businessId, "sn-b")).scan?.serial, "SN-B");

  const found = await productService.listProducts(shop.businessId, { search: "356938035643809", page: 1, pageSize: 10 } as never);
  assert.deepEqual(found.items.map((p) => p.id), [phone.id]);

  await sell(shop, [{ productId: phone.id, quantity: 1, serialNumbers: ["356938035643809"] }]);
  await assert.rejects(productService.findByBarcode(shop.businessId, "356938035643809"), /табылган жок/);
  await assert.rejects(productService.findByBarcode((await newShop({ trackSerials: true })).businessId, "SN-B"), /табылган жок/);
});

// ---------- shop windows in the sitemap ----------

test("sitemap lists switched-on catalogs that have goods, nothing else", async () => {
  const on = await newShop();
  await newProduct(on);
  await catalog.updateCatalogSettings(on.businessId, { enabled: true, slug: `on-${on.businessId.slice(-8)}`, showStock: false });
  const empty = await newShop();
  await catalog.updateCatalogSettings(empty.businessId, { enabled: true, slug: `empty-${empty.businessId.slice(-8)}`, showStock: false });
  const off = await newShop();
  await newProduct(off);
  await catalog.updateCatalogSettings(off.businessId, { enabled: false, slug: `off-${off.businessId.slice(-8)}`, showStock: false });

  const slugs = (await catalog.listedCatalogs()).map((c) => c.slug);
  assert.ok(slugs.includes(`on-${on.businessId.slice(-8)}`));
  assert.ok(!slugs.includes(`empty-${empty.businessId.slice(-8)}`));
  assert.ok(!slugs.includes(`off-${off.businessId.slice(-8)}`));
});
