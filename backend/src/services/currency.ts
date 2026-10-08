/**
 * Dollar-priced goods — pure helpers (unit-tested). Phones, laptops and
 * spare parts are bought in USD, so the shop keeps those prices in dollars
 * and the som price follows the National Bank (НБКР) rate.
 */

/** Reads the USD rate out of НБКР's daily XML (https://www.nbkr.kg/XML/daily.xml). */
export function parseNbkrUsd(xml: string): { date: string; usd: number } | null {
  const block = /<Currency\s+ISOCode="USD"\s*>([\s\S]*?)<\/Currency>/i.exec(xml)?.[1];
  const value = block && /<Value>\s*([\d.,]+)\s*<\/Value>/i.exec(block)?.[1];
  const nominal = block && /<Nominal>\s*(\d+)\s*<\/Nominal>/i.exec(block)?.[1];
  const dateMatch = /Date="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml);
  if (!value || !dateMatch) return null;
  const usd = Number(value.replace(",", ".")) / (Number(nominal) || 1);
  if (!Number.isFinite(usd) || usd <= 0) return null;
  return { date: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`, usd };
}

/** Rounds a som price *up* to the shop's step (1, 5, 10, 50, 100 som) — shops never round a price down. */
export function roundPrice(som: number, step: number): number {
  const s = step > 0 ? step : 1;
  // Small epsilon so 87.45 × 100 = 8745.000000001 doesn't jump a whole step.
  return Math.ceil(som / s - 1e-9) * s;
}

/** Som prices for a dollar-priced product at a given rate. */
export function somPrices(usd: { purchase: number | null; sale: number }, rate: number, step: number) {
  return {
    salePrice: roundPrice(usd.sale * rate, step),
    purchasePrice: usd.purchase === null ? null : Math.round(usd.purchase * rate * 100) / 100,
  };
}
