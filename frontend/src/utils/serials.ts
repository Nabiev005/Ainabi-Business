/** Splits a serial/IMEI textarea: one number per line (commas also work). */
export function parseSerials(text: string) {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** First number entered twice (case-insensitive, like the server). */
export function findDuplicateSerial(serials: string[]) {
  const seen = new Set<string>();
  for (const serial of serials) {
    const key = serial.toUpperCase();
    if (seen.has(key)) return serial;
    seen.add(key);
  }
  return null;
}
