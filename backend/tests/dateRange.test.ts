import "../src/config/timezone";
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey, resolvePreset } from "../src/utils/dateRange";

test("timezone defaults to Bishkek", () => {
  assert.equal(process.env.TZ, "Asia/Bishkek");
});

test("dayKey uses the shop's calendar day, not UTC", () => {
  // 20:00 UTC on Oct 31 is 02:00 on Nov 1 in Bishkek (UTC+6).
  assert.equal(dayKey(new Date("2026-10-31T20:00:00Z")), "2026-11-01");
  assert.equal(dayKey(new Date("2026-10-31T17:59:59Z")), "2026-10-31");
});

test("custom range: a bare date is local midnight", () => {
  const { start, end } = resolvePreset(undefined, "2026-10-01", "2026-10-31T23:59:59");
  assert.equal(start.toISOString(), "2026-09-30T18:00:00.000Z");
  assert.equal(end.toISOString(), "2026-10-31T17:59:59.000Z");
});

test("month preset starts on the 1st at local midnight", () => {
  const { start, end } = resolvePreset("month");
  assert.equal(start.getDate(), 1);
  assert.equal(start.getHours(), 0);
  assert.equal(dayKey(end), dayKey(new Date()));
});
