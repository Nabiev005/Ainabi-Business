import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNbkrUsd, roundPrice, somPrices } from "../src/services/currency";

const SAMPLE = `<?xml version="1.0" encoding="windows-1251" ?>
<CurrencyRates Name="Daily Exchange Rates" Date="09.10.2026">
<Currency ISOCode="USD">
<Nominal>1</Nominal>
<Value>87,4500</Value>
</Currency>
<Currency ISOCode="EUR">
<Nominal>1</Nominal>
<Value>97,8653</Value>
</Currency>
</CurrencyRates>`;

test("НБКР XML: USD rate and date", () => {
  assert.deepEqual(parseNbkrUsd(SAMPLE), { date: "2026-10-09", usd: 87.45 });
  assert.equal(parseNbkrUsd("<html>maintenance</html>"), null);
});

test("prices round up to the shop's step", () => {
  assert.equal(roundPrice(8745, 10), 8750);
  assert.equal(roundPrice(8750, 10), 8750);
  assert.equal(roundPrice(87.45 * 100, 1), 8745);
  assert.equal(roundPrice(8701, 100), 8800);
});

test("dollar product → som prices", () => {
  assert.deepEqual(somPrices({ purchase: 500, sale: 650 }, 87.45, 10), { salePrice: 56850, purchasePrice: 43725 });
  assert.deepEqual(somPrices({ purchase: null, sale: 1.99 }, 87.45, 1), { salePrice: 175, purchasePrice: null });
});
