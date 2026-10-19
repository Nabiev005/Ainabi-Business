import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURES, subscriptionInfo } from "../src/config/plans";

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
