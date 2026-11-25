import { ApiError } from "./ApiError";

/** Serials are stored trimmed and upper-cased, so a scan and a hand-typed
 * number always match. Blank entries are dropped, repeats are refused. */
export function normalizeSerials(raw: string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const value of raw ?? []) {
    const serial = value.trim().toUpperCase();
    if (!serial) continue;
    if (seen.has(serial)) throw ApiError.badRequest(`"${serial}" номери кайталанып жатат.`);
    seen.add(serial);
  }
  return [...seen];
}

/** Every registered serial is one physical unit, so there can't be more of
 * them than units in stock. Fewer is fine — the rest can be added later. */
export function assertSerialsFitStock(serialCount: number, quantity: number) {
  if (serialCount > quantity) {
    throw ApiError.badRequest(`Сериялык номерлер (${serialCount}) складдагы калдыктан (${quantity}) көп.`);
  }
}
