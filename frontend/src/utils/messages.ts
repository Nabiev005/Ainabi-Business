import i18n from "../i18n";
import type { Business, SaleDetail } from "../types";
import type { Reservation } from "../services/reservation.service";
import type { ReorderSuggestion } from "../services/stock.service";
import { formatDate, formatDateTime, formatMoney, formatNumber, unitLabel } from "./format";
import { whatsappLink } from "./whatsapp";

/** Ready-to-send WhatsApp texts: a receipt, a reservation reminder, an order to a supplier. */

function t(key: string, options?: Record<string, unknown>) {
  return i18n.t(key, options) as string;
}

/** Opens the person's chat with the text typed; without a usable number WhatsApp asks whom to send it to. */
export function whatsappShareLink(phone: string | null | undefined, text: string) {
  return whatsappLink(phone, text) ?? `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function receiptMessage(sale: SaleDetail, business: Pick<Business, "name" | "phone" | "address">) {
  const lines = sale.items.map((item) => {
    const qty = item.packageName ? `${formatNumber(item.packageQuantity ?? 0)} ${item.packageName}` : `${formatNumber(item.quantity)} ${unitLabel(item.unit)}`;
    return `• ${item.productName} — ${qty} × ${formatMoney(item.price)} = ${formatMoney(item.total)}`;
  });
  const out = [
    `*${business.name}*`,
    t("waMessages.receipt", { number: sale.number ?? "—", date: formatDateTime(sale.createdAt) }),
    "",
    ...lines,
    "",
  ];
  if (sale.discount > 0) out.push(`${t("print.discount")}: −${formatMoney(sale.discount)}`);
  if (sale.bonusUsed > 0) out.push(`${t("waMessages.bonusUsed")}: −${formatMoney(sale.bonusUsed)}`);
  out.push(`*${t("print.total")}: ${formatMoney(sale.total)}*`);
  if (sale.bonusEarned > 0) out.push(t("waMessages.bonusEarned", { amount: formatMoney(sale.bonusEarned) }));
  if (sale.customer?.bonusBalance) out.push(t("waMessages.bonusBalance", { amount: formatMoney(sale.customer.bonusBalance) }));
  out.push("", t("print.thanks"));
  if (business.phone) out.push(business.phone);
  return out.join("\n");
}

export function reservationMessage(r: Reservation, businessName: string) {
  return [
    t("waMessages.reservationHello", { name: r.customerName ?? "" }),
    t("waMessages.reservation", { shop: businessName, number: r.number }),
    ...r.items.map((i) => `• ${i.name} — ${formatNumber(i.quantity)} ${unitLabel(i.unit)}`),
    r.expiresAt ? t("waMessages.reservationUntil", { date: formatDate(r.expiresAt) }) : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function supplierOrderMessage(items: { row: ReorderSuggestion; quantity: number }[], businessName: string) {
  return [
    t("waMessages.orderHello"),
    t("waMessages.order", { shop: businessName }),
    "",
    ...items.map(({ row, quantity }, i) => `${i + 1}. ${row.name} — ${formatNumber(quantity)} ${unitLabel(row.unit)}`),
    "",
    t("waMessages.orderThanks"),
  ].join("\n");
}
