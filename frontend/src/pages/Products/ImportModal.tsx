import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import readXlsxFile from "read-excel-file";
import { Modal } from "../../components/ui/Modal";
import { useAuth } from "../../hooks/useAuth";
import * as productService from "../../services/product.service";
import { extractErrorMessage } from "../../services/api";
import type { ImportResult } from "../../types";

type Cell = string | number | boolean | Date | null;
const CHUNK = 200;

/** Column header → field, in every spelling a shop is likely to use. */
const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "аты", "товар", "товардын аты", "наименование", "название", "товар аты"],
  sku: ["sku", "артикул", "код"],
  barcode: ["barcode", "штрих-код", "штрихкод", "штрих код", "ean"],
  category: ["category", "категория"],
  purchasePrice: ["purchaseprice", "сатып алуу баасы", "закупочная цена", "закупка", "себестоимость", "өздүк нарк"],
  salePrice: ["saleprice", "сатуу баасы", "цена продажи", "цена", "баасы", "розничная цена"],
  wholesalePrice: ["wholesaleprice", "дүң баа", "оптовая цена", "опт"],
  quantity: ["quantity", "калдык", "саны", "остаток", "количество", "кол-во"],
  minQuantity: ["minquantity", "минималдуу калдык", "мин. калдык", "минимальный остаток", "мин. остаток"],
  unit: ["unit", "бирдик", "единица", "ед. изм.", "ед.изм"],
};

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Small CSV reader: quoted fields, "" escapes, comma or semicolon (Excel in ru locales saves with ";"). */
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const fields = useMemo(() => session?.business.productFields ?? [], [session?.business.productFields]);
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<Cell[][] | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mapping = useMemo(() => {
    if (!table || table.length === 0) return null;
    const headers = table[0].map((h) => normalize(String(h ?? "")));
    const columns: { index: number; target: string; label: string }[] = [];
    const unknown: string[] = [];
    headers.forEach((header, index) => {
      if (!header) return;
      const known = Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(header));
      if (known) return columns.push({ index, target: known[0], label: String(table[0][index]) });
      const field = fields.find((f) => normalize(f.label) === header || f.key.toLowerCase() === header);
      if (field) return columns.push({ index, target: `attr:${field.key}`, label: field.label });
      unknown.push(String(table[0][index]));
    });
    return { columns, unknown, hasName: columns.some((c) => c.target === "name") };
  }, [table, fields]);

  const rows = useMemo(() => {
    if (!table || !mapping) return [];
    return table.slice(1).map((cells) => {
      const row: Record<string, unknown> = {};
      const attributes: Record<string, unknown> = {};
      for (const col of mapping.columns) {
        let value = cells[col.index];
        if (value instanceof Date) value = value.toISOString().slice(0, 10);
        if (value === null || value === undefined || value === "") continue;
        if (col.target.startsWith("attr:")) attributes[col.target.slice(5)] = value;
        else row[col.target] = value;
      }
      if (Object.keys(attributes).length) row.attributes = attributes;
      return row;
    });
  }, [table, mapping]);

  function reset() {
    setFileName("");
    setTable(null);
    setResult(null);
    setError(null);
    setProgress(null);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    reset();
    setFileName(file.name);
    try {
      if (/\.xlsx$/i.test(file.name)) {
        setTable((await readXlsxFile(file)) as Cell[][]);
      } else {
        setTable(parseCsv(await file.text()));
      }
    } catch {
      setError(t("products.import.readFailed"));
    }
  }

  function downloadTemplate() {
    const headers = [
      t("products.import.columns.name"),
      t("products.import.columns.sku"),
      t("products.import.columns.barcode"),
      t("products.import.columns.category"),
      t("products.import.columns.purchasePrice"),
      t("products.import.columns.salePrice"),
      t("products.import.columns.wholesalePrice"),
      t("products.import.columns.quantity"),
      t("products.import.columns.minQuantity"),
      t("products.import.columns.unit"),
      ...fields.map((f) => f.label),
    ];
    const example = [t("products.import.exampleName"), "", "", t("products.import.exampleCategory"), "100", "150", "", "10", "2", t("products.units.PIECE"), ...fields.map(() => "")];
    const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = "﻿" + [headers, example].map((r) => r.map(quote).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "ainabi-products-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function runImport() {
    if (rows.length === 0) return;
    const total: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
    setProgress(0);
    try {
      for (let start = 0; start < rows.length; start += CHUNK) {
        const res = await productService.importProducts({ rows: rows.slice(start, start + CHUNK), updateExisting });
        total.created += res.created;
        total.updated += res.updated;
        total.skipped += res.skipped;
        // +1 for the header row, so numbers match what the user sees in Excel.
        total.errors.push(...res.errors.map((e) => ({ row: e.row + start + 1, message: e.message })));
        setProgress(Math.min(rows.length, start + CHUNK));
      }
      setResult(total);
      onDone();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setProgress(null);
    }
  }

  return (
    <Modal
      open={open}
      size="wide"
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <div className="stack gap-4">
        <div>
          <h2 className="card-title">
            <FileSpreadsheet size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            {t("products.import.title")}
          </h2>
          <p className="card-subtitle">{t("products.import.subtitle")}</p>
        </div>

        <div className="row gap-2" style={{ flexWrap: "wrap" }}>
          <button className="btn btn-secondary btn-sm" onClick={downloadTemplate}>
            <Download size={14} /> {t("products.import.template")}
          </button>
          <label className="btn btn-primary btn-sm" style={{ cursor: "pointer" }}>
            <Upload size={14} /> {fileName || t("products.import.chooseFile")}
            <input type="file" accept=".xlsx,.csv,text/csv" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
        </div>
        <span className="field-hint">{t("products.import.hint")}</span>

        {error && <div className="text-danger">{error}</div>}

        {mapping && !result && (
          <div className="stack gap-3">
            {!mapping.hasName ? (
              <div className="text-danger">{t("products.import.noNameColumn")}</div>
            ) : (
              <>
                <div className="chip-list">
                  {mapping.columns.map((c) => (
                    <span key={c.index} className="chip">
                      ✓ {c.label}
                    </span>
                  ))}
                  {mapping.unknown.map((u) => (
                    <span key={u} className="chip" style={{ opacity: 0.6, textDecoration: "line-through" }}>
                      {u}
                    </span>
                  ))}
                </div>
                <p style={{ margin: 0 }}>{t("products.import.rowsFound", { count: rows.length })}</p>
                <label className="row gap-2" style={{ fontSize: "var(--font-size-sm)" }}>
                  <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
                  {t("products.import.updateExisting")}
                </label>
                <span className="field-hint">{t("products.import.stockNote")}</span>
              </>
            )}
          </div>
        )}

        {progress !== null && <div className="text-muted">{t("products.import.progress", { done: progress, total: rows.length })}</div>}

        {result && (
          <div className="stack gap-2">
            <div className="stat-grid">
              <div className="stat-tile">
                <div className="stat-tile-label">{t("products.import.created")}</div>
                <div className="stat-tile-value text-success">{result.created}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">{t("products.import.updated")}</div>
                <div className="stat-tile-value">{result.updated}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">{t("products.import.skipped")}</div>
                <div className="stat-tile-value">{result.skipped}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">{t("products.import.errors")}</div>
                <div className={`stat-tile-value ${result.errors.length ? "text-danger" : ""}`}>{result.errors.length}</div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="stack gap-1" style={{ maxHeight: 200, overflowY: "auto", fontSize: "var(--font-size-sm)" }}>
                {result.errors.map((e) => (
                  <div key={e.row}>
                    <span className="mono-num text-muted">{t("products.import.row", { row: e.row })}:</span> {e.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
          <button
            className="btn btn-secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {result ? t("common.close") : t("common.cancel")}
          </button>
          {!result && (
            <button className="btn btn-primary" onClick={runImport} disabled={!mapping?.hasName || rows.length === 0 || progress !== null}>
              {t("products.import.submit", { count: rows.length })}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
