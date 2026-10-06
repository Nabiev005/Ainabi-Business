import "../src/config/timezone";
import { test } from "node:test";
import assert from "node:assert/strict";
import { DayRow, projectMonth, weekdayFactors } from "../src/services/forecast";
import { dayKey } from "../src/utils/dateRange";

/** One row per calendar day from `from` to `to` (inclusive, "YYYY-MM-DD"). */
function days(from: string, to: string, revenue: (date: Date) => number): DayRow[] {
  const rows: DayRow[] = [];
  for (let d = new Date(`${from}T00:00:00`); dayKey(d) <= to; d.setDate(d.getDate() + 1)) {
    const r = revenue(d);
    rows.push({ date: dayKey(d), revenue: r, profit: r * 0.3 });
  }
  return rows;
}

const noon = (date: string) => new Date(`${date}T12:00:00`);

test("flat pace: finished days' average fills the rest of the month", () => {
  // September has 30 days; 10 finished days of 1000, nothing sold yet today.
  const rows = [...days("2026-09-01", "2026-09-10", () => 1000), { date: "2026-09-11", revenue: 0, profit: 0 }];
  const f = projectMonth({ days: rows, now: noon("2026-09-11"), plan: 25000 });

  assert.equal(f.basis, "month");
  assert.equal(f.weekdayAdjusted, false);
  assert.equal(f.actual, 10000);
  assert.equal(f.avgDaily, 1000);
  // 10 000 so far + today counted as an average day + 19 more days.
  assert.equal(f.forecast, 30000);
  assert.equal(f.forecastProfit, 9000);
  assert.equal(f.forecastPercent, 120);
  assert.equal(f.actualPercent, 40);
  assert.equal(f.neededPerDay, Math.round((15000 / 20) * 100) / 100);
  assert.equal(f.cumulative.length, 30);
  assert.equal(f.cumulative[29].forecast, 30000);
  assert.equal(f.cumulative[29].actual, null);
});

test("a strong today counts in full", () => {
  const rows = [...days("2026-09-01", "2026-09-10", () => 1000), { date: "2026-09-11", revenue: 3000, profit: 900 }];
  const f = projectMonth({ days: rows, now: noon("2026-09-11"), plan: null });
  assert.equal(f.actual, 13000);
  assert.equal(f.forecast, 32000);
});

test("early in the month the pace comes from the last two weeks", () => {
  const rows = days("2026-09-18", "2026-10-02", (d) => (d.getMonth() === 8 ? 500 : 800));
  const f = projectMonth({ days: rows, now: noon("2026-10-02"), plan: null });
  assert.equal(f.basis, "recent");
  // 13 September days at 500 + Oct 1 at 800, over 14 days.
  assert.equal(f.avgDaily, Math.round(((13 * 500 + 800) / 14) * 100) / 100);
});

test("no plan: no percentages", () => {
  const f = projectMonth({ days: days("2026-09-01", "2026-09-11", () => 1000), now: noon("2026-09-11"), plan: null });
  assert.equal(f.forecastPercent, null);
  assert.equal(f.actualPercent, null);
  assert.equal(f.neededPerDay, null);
});

test("weekday factors need four weeks of history", () => {
  assert.deepEqual(weekdayFactors(days("2026-09-01", "2026-09-20", () => 1000)), [1, 1, 1, 1, 1, 1, 1]);
});

test("weekly pattern: Saturdays selling double are projected as double", () => {
  const saturdayDouble = (d: Date) => (d.getDay() === 6 ? 2000 : 1000);
  // Eight weeks of history up to Tue Oct 20, 2026.
  const rows = days("2026-08-23", "2026-10-20", saturdayDouble);
  const f = projectMonth({ days: rows, now: noon("2026-10-20"), plan: null });

  assert.equal(f.weekdayAdjusted, true);
  // The pattern holds exactly, so the projection must equal the real month.
  const wholeMonth = days("2026-10-01", "2026-10-31", saturdayDouble).reduce((s, d) => s + d.revenue, 0);
  assert.equal(f.forecast, wholeMonth);

  const factors = weekdayFactors(rows.slice(0, -1).slice(-56));
  assert.ok(Math.abs(factors[6] / factors[1] - 2) < 1e-9);
});

test("a month of zero sales forecasts zero, not NaN", () => {
  const f = projectMonth({ days: days("2026-08-01", "2026-10-20", () => 0), now: noon("2026-10-20"), plan: 1000 });
  assert.equal(f.forecast, 0);
  assert.equal(f.forecastPercent, 0);
  assert.equal(f.neededPerDay, Math.round((1000 / 12) * 100) / 100);
});
