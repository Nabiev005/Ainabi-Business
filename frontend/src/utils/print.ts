/**
 * Prints a standalone HTML document through a hidden iframe — receipts,
 * repair tickets and barcode labels get their own page size and styles
 * without fighting the app's CSS, and nothing opens as a popup (which
 * browsers tend to block).
 */
export function printHtml(bodyHtml: string, css: string, title = "Ainabi Business") {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`);
  doc.close();

  const run = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // Give the print dialog time to grab the document before removing it.
    window.setTimeout(() => iframe.remove(), 1500);
  };
  // Wait for images (logos / barcodes as <img>) before printing.
  const images = Array.from(doc.images);
  if (images.length === 0) window.setTimeout(run, 50);
  else Promise.all(images.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => (img.onload = img.onerror = r))))).then(run);
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
