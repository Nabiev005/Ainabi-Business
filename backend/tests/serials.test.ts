import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSerialsFitStock, normalizeSerials } from "../src/utils/serials";
import { translate } from "../src/i18n/messages";
import { productSchema } from "../src/validators/product.validator";

test("serials are trimmed, upper-cased and blanks dropped", () => {
  assert.deepEqual(normalizeSerials([" sn-1a ", "", "  ", "356938035643809"]), ["SN-1A", "356938035643809"]);
  assert.deepEqual(normalizeSerials(undefined), []);
});

test("the same serial twice is refused, whatever its case", () => {
  assert.throws(() => normalizeSerials(["abc1", "ABC1 "]), /"ABC1" номери кайталанып жатат/);
});

test("no more serials than units in stock", () => {
  assert.doesNotThrow(() => assertSerialsFitStock(2, 2));
  assert.doesNotThrow(() => assertSerialsFitStock(1, 5));
  assert.throws(
    () => assertSerialsFitStock(3, 2),
    (e: Error) => translate(e.message, "ru") === "Серийных номеров (3) больше, чем остаток на складе (2).",
  );
});

test("product input: serials are optional and length-limited", () => {
  const base = { name: "Lenovo", purchasePrice: 1, salePrice: 2 };
  assert.equal(productSchema.parse(base).serialNumbers, undefined);
  assert.deepEqual(productSchema.parse({ ...base, serialNumbers: [" A1 "] }).serialNumbers, ["A1"]);
  assert.equal(productSchema.safeParse({ ...base, serialNumbers: ["x".repeat(65)] }).success, false);
});
