import JsBarcode from "jsbarcode";
import { formatMoney } from "./format";
import { escapeHtml as e, printHtml } from "./print";

export type LabelSize = "58x40" | "40x30" | "A4";

export interface LabelItem {
  name: string;
  barcode: string | null;
  price: number;
  subtitle?: string | null;
  copies: number;
}

/** EAN-13 when the code is a valid EAN, CODE128 for anything else (SKU-style codes). */
function barcodeSvg(code: string, height: number): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const options = { height, margin: 0, fontSize: 11, textMargin: 1, width: 1.4, displayValue: true };
  try {
    if (/^\d{13}$/.test(code)) JsBarcode(svg, code, { ...options, format: "EAN13" });
    else JsBarcode(svg, code, { ...options, format: "CODE128" });
  } catch {
    JsBarcode(svg, code, { ...options, format: "CODE128" });
  }
  return new XMLSerializer().serializeToString(svg);
}

const SIZES: Record<LabelSize, { page: string; w: string; h: string; barcodeHeight: number; grid?: boolean }> = {
  "58x40": { page: "58mm 40mm", w: "58mm", h: "40mm", barcodeHeight: 38 },
  "40x30": { page: "40mm 30mm", w: "40mm", h: "30mm", barcodeHeight: 26 },
  A4: { page: "A4", w: "70mm", h: "37mm", barcodeHeight: 34, grid: true },
};

export function printLabels(items: LabelItem[], options: { size: LabelSize; showPrice: boolean; businessName?: string }) {
  const size = SIZES[options.size];
  const labels = items
    .filter((i) => i.barcode && i.copies > 0)
    .flatMap((item) => {
      const html = `
        <div class="label">
          ${options.businessName ? `<div class="biz">${e(options.businessName)}</div>` : ""}
          <div class="name">${e(item.name)}</div>
          ${item.subtitle ? `<div class="sub">${e(item.subtitle)}</div>` : ""}
          ${options.showPrice ? `<div class="price">${e(formatMoney(item.price))}</div>` : ""}
          <div class="code">${barcodeSvg(item.barcode!, size.barcodeHeight)}</div>
        </div>`;
      return Array.from({ length: Math.min(item.copies, 500) }, () => html);
    })
    .join("");

  const css = `
    @page { size: ${size.page}; margin: ${size.grid ? "10mm 0" : "0"}; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #000; }
    ${size.grid ? ".sheet { display: grid; grid-template-columns: repeat(3, 70mm); justify-content: center; }" : ""}
    .label {
      width: ${size.w}; height: ${size.h}; padding: 1.5mm 2mm; overflow: hidden;
      display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center;
      ${size.grid ? "" : "page-break-after: always;"}
    }
    .biz { font-size: 7px; text-transform: uppercase; letter-spacing: .04em; color: #333; }
    .name { font-size: ${options.size === "40x30" ? "8px" : "10px"}; font-weight: 600; line-height: 1.15; max-height: 2.4em; overflow: hidden; }
    .sub { font-size: 8px; color: #333; }
    .price { font-size: ${options.size === "40x30" ? "11px" : "14px"}; font-weight: 800; }
    .code svg { max-width: 100%; height: auto; display: block; }
  `;
  printHtml(size.grid ? `<div class="sheet">${labels}</div>` : labels, css, "Labels");
}
