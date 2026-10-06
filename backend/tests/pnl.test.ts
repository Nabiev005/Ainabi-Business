import "../src/config/timezone";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { dailySeries, PnlRaw, summarize } from "../src/services/pnl";

const at = (local: string) => new Date(local);
const dec = (v: string) => new Prisma.Decimal(v);

const raw: PnlRaw = {
  sales: [
    { total: dec("1000.50"), costTotal: dec("600.25"), discount: dec("50"), createdAt: at("2026-10-01T10:00:00") },
    { total: dec("2000"), costTotal: dec("1200"), discount: dec("0"), createdAt: at("2026-10-02T23:30:00") },
  ],
  returns: [{ total: dec("500"), costTotal: dec("300"), createdAt: at("2026-10-02T12:00:00") }],
  expenses: [
    { amount: dec("300"), category: "RENT", createdAt: at("2026-10-01T09:00:00") },
    { amount: dec("100"), category: "OTHER", createdAt: at("2026-10-02T09:00:00") },
    { amount: dec("50"), category: "OTHER", createdAt: at("2026-10-02T10:00:00") },
  ],
  repairs: [
    { finalPrice: dec("400"), deliveredAt: at("2026-10-02T15:00:00") },
    { finalPrice: dec("999"), deliveredAt: null },
  ],
  writeOffs: [{ quantity: dec("2"), createdAt: at("2026-10-01T18:00:00"), product: { purchasePrice: dec("75") } }],
  counts: [{ shortageValue: dec("120"), surplusValue: dec("20"), createdAt: at("2026-10-02T20:00:00") }],
};

test("profit and loss statement", () => {
  const { statement: s, expensesByCategory } = summarize(raw);
  assert.equal(s.grossSales, 3000.5);
  assert.equal(s.returns, 500);
  assert.equal(s.revenue, 2500.5);
  assert.equal(s.cogs, 1500.25);
  assert.equal(s.grossProfit, 1000.25);
  // summarize() counts every repair it gets — filtering to delivered ones is the query's job.
  assert.equal(s.repairRevenue, 1399);
  assert.equal(s.expenses, 450);
  assert.equal(s.writeOffLoss, 150);
  assert.equal(s.stockLosses, 250);
  // 1000.25 + 1399 − 450 − 250
  assert.equal(s.netProfit, 1699.25);
  assert.equal(s.salesCount, 2);
  assert.equal(s.avgCheck, 1250.25);
  assert.equal(s.marginPercent, 40);
  assert.equal(s.discounts, 50);
  assert.deepEqual(expensesByCategory, [
    { category: "RENT", amount: 300 },
    { category: "OTHER", amount: 150 },
  ]);
});

test("empty period is all zeros, no division by zero", () => {
  const { statement: s } = summarize({ sales: [], returns: [], expenses: [], repairs: [], writeOffs: [], counts: [] });
  assert.equal(s.netProfit, 0);
  assert.equal(s.avgCheck, 0);
  assert.equal(s.marginPercent, 0);
});

test("daily series: every day present, profits add up to net profit", () => {
  const withoutPending = { ...raw, repairs: raw.repairs.filter((r) => r.deliveredAt) };
  const series = dailySeries(withoutPending, at("2026-10-01T00:00:00"), at("2026-10-03T23:59:59"));
  assert.deepEqual(
    series.map((d) => d.date),
    ["2026-10-01", "2026-10-02", "2026-10-03"],
  );
  // A sale at 23:30 local belongs to Oct 2 even though it's Oct 2 17:30 UTC.
  assert.equal(series[1].revenue, 2000 - 500);
  assert.equal(series[2].profit, 0);
  const total = series.reduce((acc, d) => acc + d.profit, 0);
  assert.equal(Math.round(total * 100) / 100, summarize(withoutPending).statement.netProfit);
});
