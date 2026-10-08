import "../src/config/timezone";
import { test } from "node:test";
import assert from "node:assert/strict";
import { EmployeeActivity, isNight, riskLevel, signalsFor } from "../src/services/risk";

const clean: EmployeeActivity = {
  employeeId: "e1",
  name: "Азамат",
  revenue: 100_000,
  salesCount: 120,
  discount: 1000,
  subtotal: 101_000,
  maxedDiscounts: 0,
  belowCostLoss: 0,
  belowCostSales: 0,
  wholesaleNoCustomer: 0,
  returnsValue: 0,
  returnsCount: 0,
  cashShort: 0,
  shortShifts: 0,
  stockOutValue: 0,
  inventoryShortage: 0,
  nightSales: 0,
};

test("an ordinary seller raises nothing", () => {
  const s = signalsFor(clean);
  assert.deepEqual(s, []);
  assert.deepEqual(riskLevel(s), { score: 0, level: "OK" });
});

test("several strong signals add up to HIGH", () => {
  const s = signalsFor({
    ...clean,
    discount: 15_000,
    subtotal: 115_000, // 13% discounts
    maxedDiscounts: 12,
    belowCostLoss: 2500, // 2.5% of revenue
    cashShort: 1500,
    shortShifts: 2,
  });
  assert.deepEqual(
    s.map((x) => [x.key, x.weight]),
    [
      ["discountRate", 2],
      ["maxedDiscounts", 2],
      ["belowCost", 2],
      ["cashShort", 2],
    ],
  );
  assert.equal(riskLevel(s).level, "HIGH");
});

test("one small thing is LOW", () => {
  const s = signalsFor({ ...clean, cashShort: 200, shortShifts: 1 });
  assert.deepEqual(s, [{ key: "cashShort", weight: 1, value: 200 }]);
  assert.equal(riskLevel(s).level, "LOW");
});

test("a single return isn't a pattern", () => {
  assert.deepEqual(signalsFor({ ...clean, returnsValue: 20_000, returnsCount: 1 }), []);
  assert.equal(signalsFor({ ...clean, returnsValue: 12_000, returnsCount: 4 })[0].key, "returns");
});

test("night is 22:00–07:00 shop time", () => {
  assert.equal(isNight(new Date("2026-10-08T23:30:00")), true);
  assert.equal(isNight(new Date("2026-10-08T06:59:00")), true);
  assert.equal(isNight(new Date("2026-10-08T07:00:00")), false);
  assert.equal(isNight(new Date("2026-10-08T21:59:00")), false);
});
