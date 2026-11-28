import { test } from "node:test";
import assert from "node:assert/strict";
import { businessHas, FEATURES, subscriptionInfo } from "../src/config/plans";

test("a complimentary business never runs out and has everything", () => {
  const s = subscriptionInfo({ plan: "BASIC", planExpiresAt: new Date("2020-01-01"), isTrial: true, complimentary: true });
  assert.equal(s.active, true);
  assert.equal(s.endingSoon, false);
  assert.equal(s.isTrial, false);
  assert.equal(s.plan, "MAX");
  assert.deepEqual(s.features, [...FEATURES]);
  assert.equal(s.maxEmployees, null);
});

test("an ordinary expired business is not active", () => {
  const s = subscriptionInfo({ plan: "PRO", planExpiresAt: new Date("2020-01-01"), isTrial: false });
  assert.equal(s.active, false);
  assert.equal(s.complimentary, false);
});

test("plan split: Pro gets loyalty/reservations/wholesale, Max adds AI, risk and Telegram", () => {
  const future = new Date(Date.now() + 86_400_000);
  const basic = subscriptionInfo({ plan: "BASIC", planExpiresAt: future, isTrial: false });
  const pro = subscriptionInfo({ plan: "PRO", planExpiresAt: future, isTrial: true });
  const max = subscriptionInfo({ plan: "MAX", planExpiresAt: future, isTrial: false });
  assert.deepEqual(basic.features, []);
  for (const f of ["loyalty", "reservations", "wholesale", "analytics"] as const) assert.ok(pro.features.includes(f), f);
  for (const f of ["ai", "risk", "telegram"] as const) {
    assert.ok(!pro.features.includes(f), f);
    assert.ok(max.features.includes(f), f);
  }
});

test("plan split: businesses from before keep their modules until the grace date", () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 1000);
  const oldBasic = subscriptionInfo({ plan: "BASIC", planExpiresAt: future, isTrial: false, legacyFeaturesUntil: future });
  assert.deepEqual([...oldBasic.features].sort(), ["loyalty", "reservations", "risk", "telegram", "wholesale"]);
  assert.ok(!oldBasic.features.includes("ai"), "Basic never had the assistant");
  const oldPro = subscriptionInfo({ plan: "PRO", planExpiresAt: future, isTrial: false, legacyFeaturesUntil: future });
  for (const f of ["ai", "risk", "telegram"] as const) assert.ok(oldPro.features.includes(f), f);
  const graceOver = subscriptionInfo({ plan: "PRO", planExpiresAt: future, isTrial: false, legacyFeaturesUntil: past });
  assert.ok(!graceOver.features.includes("ai"));
  assert.equal(businessHas({ plan: "BASIC", legacyFeaturesUntil: future }, "loyalty"), true);
  assert.equal(businessHas({ plan: "BASIC" }, "loyalty"), false);
  assert.equal(businessHas({ plan: "BASIC", complimentary: true }, "ai"), true);
});
