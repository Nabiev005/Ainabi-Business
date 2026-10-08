/**
 * WhatsApp "click to chat" links — open the person's chat with the text
 * already typed, from the phone or WhatsApp Web. Free, no API account.
 */

/** "0700 123 456", "+996 (700) 12-34-56", "700123456" → "996700123456"; null if it can't be a number. */
export function normalizeKgPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("996") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `996${digits.slice(1)}`;
  if (digits.length === 9) return `996${digits}`;
  // Foreign or already international (e.g. a Kazakh +7 number).
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const number = normalizeKgPhone(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}
