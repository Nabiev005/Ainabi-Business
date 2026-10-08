import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonthsToDay, buildSchedule, needsReminder, scheduleStatus } from "../src/services/installments";

test("month arithmetic clamps to the month's last day", () => {
  assert.equal(addMonthsToDay("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsToDay("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonthsToDay("2026-11-15", 3), "2027-02-15");
});

test("schedule: whole-som parts that add up to the total", () => {
  const plan = buildSchedule(10_000, 3, "2026-10-10");
  assert.deepEqual(plan, [
    { dueDate: "2026-10-10", amount: 3333 },
    { dueDate: "2026-11-10", amount: 3333 },
    { dueDate: "2026-12-10", amount: 3334 },
  ]);
  assert.equal(
    plan.reduce((s, p) => s + p.amount, 0),
    10_000,
  );
});

test("payments cover installments in date order", () => {
  const plan = buildSchedule(9000, 3, "2026-09-01");
  // 4000 paid: first fully, second partly; today is after the second date.
  const s = scheduleStatus(plan, 4000, "2026-10-05");
  assert.deepEqual(
    s.items.map((i) => [i.state, i.paid]),
    [
      ["PAID", 3000],
      ["OVERDUE", 1000],
      ["UPCOMING", 0],
    ],
  );
  assert.equal(s.overdueAmount, 2000);
  assert.equal(s.daysOverdue, 4);
  assert.deepEqual(s.next, { dueDate: "2026-10-01", amount: 2000 });
  assert.equal(needsReminder(s, "2026-10-05"), true);
});

test("due soon vs upcoming, and a fully paid plan", () => {
  const plan = buildSchedule(2000, 2, "2026-10-10");
  const soon = scheduleStatus(plan, 0, "2026-10-08");
  assert.equal(soon.items[0].state, "DUE_SOON");
  assert.equal(needsReminder(soon, "2026-10-08"), true);

  const early = scheduleStatus(plan, 0, "2026-10-01");
  assert.equal(early.items[0].state, "UPCOMING");
  assert.equal(needsReminder(early, "2026-10-01"), false);

  const done = scheduleStatus(plan, 2000, "2026-12-01");
  assert.equal(done.next, null);
  assert.equal(done.overdueAmount, 0);
  assert.equal(needsReminder(done, "2026-12-01"), false);
});
