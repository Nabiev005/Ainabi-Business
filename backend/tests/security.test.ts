import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../src/utils/csv";
import { imageUrlSchema } from "../src/validators/common";

test("CSV: text that Excel would run as a formula is defused", () => {
  const csv = toCsv([
    { name: '=HYPERLINK("http://evil","click")', qty: -5 },
    { name: "+1 sum", qty: 3 },
    { name: "@cmd", qty: 0 },
    { name: "Normal", qty: 1 },
  ]);
  const rows = csv.split("\n");
  assert.equal(rows[1], `"'=HYPERLINK(""http://evil"",""click"")","-5"`);
  assert.equal(rows[2], `"'+1 sum","3"`);
  assert.equal(rows[3], `"'@cmd","0"`);
  // Numbers (even negative) and ordinary text are untouched.
  assert.equal(rows[4], `"Normal","1"`);
});

test("product image: only http(s) links or an inline image", () => {
  const ok = ["", "https://cdn.example.com/a.jpg", "data:image/jpeg;base64,/9j/4AAQSkZJRg==", null, undefined];
  for (const v of ok) assert.equal(imageUrlSchema.safeParse(v).success, true, String(v));

  const bad = [
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "https://ok.com/a.jpg onerror=alert(1)",
    `data:image/png;base64,${"A".repeat(1_500_001)}`,
  ];
  for (const v of bad) assert.equal(imageUrlSchema.safeParse(v).success, false, v.slice(0, 40));
});
