/**
 * Till watch (касса көзөмөлү) — pure scoring, no database, unit-tested.
 *
 * Nothing here proves theft. Each signal is a pattern that, in shops, often
 * goes with money or goods leaking out: discounts at the cap, selling below
 * cost, wholesale prices for walk-in customers, many returns on one seller's
 * receipts, cash short at shift close, goods written off, sales at night.
 * The owner gets a short list of who to look at and why.
 */

export interface EmployeeActivity {
  employeeId: string;
  name: string;
  revenue: number;
  salesCount: number;
  /** Total discount given and the subtotal it was taken from. */
  discount: number;
  subtotal: number;
  /** Receipts where the discount was at (or within 10% of) the seller's cap. */
  maxedDiscounts: number;
  /** Money lost on lines sold below their cost price. */
  belowCostLoss: number;
  belowCostSales: number;
  /** Wholesale-priced sales to customers not marked as wholesale (or no customer). */
  wholesaleNoCustomer: number;
  /** Value returned on this employee's own receipts. */
  returnsValue: number;
  returnsCount: number;
  /** Sum of negative cash differences at shift close (a positive number). */
  cashShort: number;
  shortShifts: number;
  /** Cost value of goods this employee wrote off / took out by hand. */
  stockOutValue: number;
  /** Shortage found by inventory counts this employee ran. */
  inventoryShortage: number;
  /** Sales between 22:00 and 07:00. */
  nightSales: number;
}

export type SignalKey =
  | "discountRate"
  | "maxedDiscounts"
  | "belowCost"
  | "wholesaleNoCustomer"
  | "returns"
  | "cashShort"
  | "stockOut"
  | "inventoryShortage"
  | "nightSales";

export interface Signal {
  key: SignalKey;
  /** 1 = worth a look, 2 = strong. */
  weight: 1 | 2;
  /** The figure the text quotes (percent, som or count). */
  value: number;
}

export type RiskLevel = "OK" | "LOW" | "MEDIUM" | "HIGH";

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

/** Weight for `value` against two thresholds: below `soft` → none, below `hard` → 1, else 2. */
function grade(value: number, soft: number, hard: number): 0 | 1 | 2 {
  if (value < soft) return 0;
  return value < hard ? 1 : 2;
}

export function signalsFor(a: EmployeeActivity): Signal[] {
  const out: Signal[] = [];
  const add = (key: SignalKey, weight: 0 | 1 | 2, value: number) => {
    if (weight !== 0) out.push({ key, weight, value });
  };

  const discountPct = pct(a.discount, a.subtotal);
  add("discountRate", grade(discountPct, 5, 10), discountPct);
  add("maxedDiscounts", grade(a.maxedDiscounts, 3, 10), a.maxedDiscounts);
  // Any loss-making line counts; strong once it's 1% of what they sold.
  add("belowCost", a.belowCostLoss <= 0 ? 0 : pct(a.belowCostLoss, a.revenue) >= 1 ? 2 : 1, Math.round(a.belowCostLoss));
  add("wholesaleNoCustomer", grade(a.wholesaleNoCustomer, 1, 5), a.wholesaleNoCustomer);
  const returnsPct = pct(a.returnsValue, a.revenue + a.returnsValue);
  add("returns", a.returnsCount < 2 ? 0 : grade(returnsPct, 5, 10), returnsPct);
  add("cashShort", a.cashShort <= 0 ? 0 : a.cashShort >= 1000 || a.shortShifts >= 3 ? 2 : 1, Math.round(a.cashShort));
  add("stockOut", a.stockOutValue <= 0 ? 0 : a.stockOutValue >= 5000 ? 2 : 1, Math.round(a.stockOutValue));
  add("inventoryShortage", a.inventoryShortage <= 0 ? 0 : a.inventoryShortage >= 5000 ? 2 : 1, Math.round(a.inventoryShortage));
  add("nightSales", grade(a.nightSales, 1, 5), a.nightSales);

  return out.sort((x, y) => y.weight - x.weight);
}

export function riskLevel(signals: Signal[]): { score: number; level: RiskLevel } {
  const score = signals.reduce((s, x) => s + x.weight, 0);
  const level: RiskLevel = score === 0 ? "OK" : score <= 2 ? "LOW" : score <= 5 ? "MEDIUM" : "HIGH";
  return { score, level };
}

/** Local hour of a moment, for the night-sales rule. */
export const isNight = (d: Date) => d.getHours() >= 22 || d.getHours() < 7;
