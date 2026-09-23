import i18n from "../i18n";
import type { Business, RepairOrder, SaleDetail } from "../types";
import { formatDate, formatDateTime, formatMoney, formatNumber, unitLabel } from "./format";
import { escapeHtml as e, printHtml } from "./print";

/** Narrow thermal-printer layout (58/80 mm rolls), falls back fine on A4. */
const RECEIPT_CSS = `
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; color: #000; width: 72mm; margin: 0 auto; }
  h1 { font-size: 15px; margin: 0 0 2px; text-align: center; }
  .center { text-align: center; }
  .muted { color: #444; font-size: 11px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  .num { text-align: right; white-space: nowrap; }
  .total td { font-size: 14px; font-weight: 700; padding-top: 4px; }
  .small { font-size: 10px; }
  .line-name { font-weight: 600; }
`;

function t(key: string, options?: Record<string, unknown>) {
  return i18n.t(key, options) as string;
}

function header(business: Pick<Business, "name" | "address" | "phone">) {
  return `
    <h1>${e(business.name)}</h1>
    ${business.address ? `<div class="center muted">${e(business.address)}</div>` : ""}
    ${business.phone ? `<div class="center muted">${e(business.phone)}</div>` : ""}
    <hr/>`;
}

export function printSaleReceipt(sale: SaleDetail, business: Business) {
  const paymentLabels = t("labels.paymentMethod", { returnObjects: true }) as unknown as Record<string, string>;
  const lines = sale.items
    .map((item) => {
      const qty = item.packageName
        ? `${formatNumber(item.packageQuantity ?? 0)} ${e(item.packageName)}`
        : `${formatNumber(item.quantity)} ${e(unitLabel(item.unit))}`;
      const serials = item.serialNumbers.length ? `<div class="small">IMEI/S/N: ${item.serialNumbers.map(e).join(", ")}</div>` : "";
      const warranty = item.warrantyUntil ? `<div class="small">${e(t("print.warrantyUntil", { date: formatDate(item.warrantyUntil) }))}</div>` : "";
      return `
        <tr><td colspan="2" class="line-name">${e(item.productName)}</td></tr>
        <tr><td>${qty} × ${e(formatMoney(item.price))}</td><td class="num">${e(formatMoney(item.total))}</td></tr>
        ${serials || warranty ? `<tr><td colspan="2">${serials}${warranty}</td></tr>` : ""}`;
    })
    .join("");

  const body = `
    ${header(business)}
    <div class="center"><b>${e(t("print.receiptTitle", { number: sale.number ?? "—" }))}</b></div>
    <div class="center muted">${e(formatDateTime(sale.createdAt))}</div>
    <div class="muted">${e(t("print.cashier"))}: ${e(sale.cashierName)}${sale.locationName ? ` · ${e(sale.locationName)}` : ""}</div>
    ${sale.customer ? `<div class="muted">${e(t("print.customer"))}: ${e(sale.customer.name)}</div>` : ""}
    <hr/>
    <table>${lines}</table>
    <hr/>
    <table>
      <tr><td>${e(t("print.subtotal"))}</td><td class="num">${e(formatMoney(sale.subtotal))}</td></tr>
      ${sale.discount > 0 ? `<tr><td>${e(t("print.discount"))}</td><td class="num">−${e(formatMoney(sale.discount))}</td></tr>` : ""}
      <tr class="total"><td>${e(t("print.total"))}</td><td class="num">${e(formatMoney(sale.total))}</td></tr>
      <tr><td>${e(t("print.payment"))}</td><td class="num">${e(paymentLabels[sale.paymentMethod] ?? sale.paymentMethod)}</td></tr>
      ${sale.returnedTotal > 0 ? `<tr><td>${e(t("print.returned"))}</td><td class="num">−${e(formatMoney(sale.returnedTotal))}</td></tr>` : ""}
    </table>
    <hr/>
    <div class="center">${e(t("print.thanks"))}</div>`;

  printHtml(body, RECEIPT_CSS, t("print.receiptTitle", { number: sale.number ?? "" }));
}

/** Two copies on one roll: the customer's ticket and the workshop's tag. */
export function printRepairTicket(repair: RepairOrder, business: Business) {
  const block = (copyLabel: string) => `
    ${header(business)}
    <div class="center"><b>${e(t("print.repairTitle", { number: repair.number }))}</b></div>
    <div class="center muted">${e(copyLabel)} · ${e(formatDateTime(repair.createdAt))}</div>
    <hr/>
    <table>
      <tr><td>${e(t("print.customer"))}</td><td class="num">${e(repair.customerName)}</td></tr>
      ${repair.customerPhone ? `<tr><td>${e(t("print.phone"))}</td><td class="num">${e(repair.customerPhone)}</td></tr>` : ""}
      <tr><td>${e(t("print.device"))}</td><td class="num">${e(repair.device)}</td></tr>
      ${repair.serial ? `<tr><td>IMEI/S/N</td><td class="num">${e(repair.serial)}</td></tr>` : ""}
    </table>
    <div style="margin-top:4px"><b>${e(t("print.problem"))}:</b> ${e(repair.problem)}</div>
    <hr/>
    <table>
      ${repair.estimatedPrice !== null ? `<tr><td>${e(t("print.estimate"))}</td><td class="num">${e(formatMoney(repair.estimatedPrice))}</td></tr>` : ""}
      ${repair.prepayment > 0 ? `<tr><td>${e(t("print.prepayment"))}</td><td class="num">${e(formatMoney(repair.prepayment))}</td></tr>` : ""}
      ${repair.finalPrice !== null ? `<tr class="total"><td>${e(t("print.total"))}</td><td class="num">${e(formatMoney(repair.finalPrice))}</td></tr>` : ""}
    </table>
    <div class="small" style="margin-top:6px">${e(t("print.repairTerms"))}</div>
    <div style="margin-top:14px" class="muted">${e(t("print.signature"))}: ____________________</div>`;

  const body = `${block(t("print.customerCopy"))}<div style="page-break-after:always;height:12px"></div>${block(t("print.workshopCopy"))}`;
  printHtml(body, RECEIPT_CSS, t("print.repairTitle", { number: repair.number }));
}
