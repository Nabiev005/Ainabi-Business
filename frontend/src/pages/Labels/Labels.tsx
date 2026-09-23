import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Printer, Tag, Trash2 } from "lucide-react";
import { ProductSearchBox } from "../../components/ProductSearchBox";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import * as productService from "../../services/product.service";
import * as stockService from "../../services/stock.service";
import { extractErrorMessage } from "../../services/api";
import { formatMoney } from "../../utils/format";
import { LabelSize, printLabels } from "../../utils/labels";
import type { Product } from "../../types";

interface Row {
  key: string;
  name: string;
  subtitle: string | null;
  barcode: string | null;
  price: number;
  copies: number;
}

function rowFromProduct(product: Product, copies = 1, packageId?: string | null): Row {
  const pkg = packageId ? product.packages.find((p) => p.id === packageId) : null;
  return {
    key: pkg ? `${product.id}:${pkg.id}` : product.id,
    name: product.variantGroupName ?? product.name,
    subtitle: [product.variantLabel, pkg?.name].filter(Boolean).join(" · ") || null,
    barcode: pkg ? pkg.barcode : product.barcode,
    price: pkg ? (pkg.salePrice ?? product.salePrice * pkg.factor) : product.salePrice,
    copies,
  };
}

export default function Labels() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { showToast } = useToast();
  const [params] = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [size, setSize] = useState<LabelSize>(() => {
    try {
      return (localStorage.getItem("ainabi:label-size") as LabelSize) || "58x40";
    } catch {
      return "58x40";
    }
  });
  const [showPrice, setShowPrice] = useState(true);
  const [showBusiness, setShowBusiness] = useState(true);

  // Prefill from a receipt (?receipt=id) or a product (?product=id).
  useEffect(() => {
    const receiptId = params.get("receipt");
    const productId = params.get("product");
    if (receiptId) {
      stockService
        .getReceipt(receiptId)
        .then((receipt) =>
          setRows(
            receipt.items.map((i) => ({
              key: i.productId,
              name: i.productName,
              subtitle: null,
              barcode: i.barcode,
              price: i.salePrice,
              // Whole units get one label each; weighed goods get one.
              copies: Number.isInteger(i.quantity) ? Math.min(i.quantity, 500) : 1,
            })),
          ),
        )
        .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
    } else if (productId) {
      productService
        .getProduct(productId)
        .then((p) => setRows([rowFromProduct(p)]))
        .catch(() => undefined);
    }
  }, [params, showToast, t]);

  function add(product: Product, packageId?: string | null) {
    const row = rowFromProduct(product, 1, packageId);
    setRows((prev) => (prev.some((r) => r.key === row.key) ? prev.map((r) => (r.key === row.key ? { ...r, copies: r.copies + 1 } : r)) : [...prev, row]));
  }

  function print() {
    try {
      localStorage.setItem("ainabi:label-size", size);
    } catch {
      /* ignore */
    }
    printLabels(rows, { size, showPrice, businessName: showBusiness ? session?.business.name : undefined });
  }

  const totalLabels = rows.filter((r) => r.barcode).reduce((s, r) => s + r.copies, 0);

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("labels.title")}</h1>
          <p className="page-subtitle">{t("labels.subtitle")}</p>
        </div>
        <button className="btn btn-primary" onClick={print} disabled={totalLabels === 0}>
          <Printer size={18} /> {t("labels.print", { count: totalLabels })}
        </button>
      </div>

      <div className="card card-pad stack gap-4">
        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("labels.size")}</label>
            <select className="select" value={size} onChange={(e) => setSize(e.target.value as LabelSize)}>
              <option value="58x40">58 × 40 {t("labels.mm")}</option>
              <option value="40x30">40 × 30 {t("labels.mm")}</option>
              <option value="A4">{t("labels.a4")}</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">{t("labels.show")}</label>
            <div className="row gap-4" style={{ minHeight: 38 }}>
              <label className="row gap-2">
                <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> {t("labels.showPrice")}
              </label>
              <label className="row gap-2">
                <input type="checkbox" checked={showBusiness} onChange={(e) => setShowBusiness(e.target.checked)} /> {t("labels.showBusiness")}
              </label>
            </div>
          </div>
        </div>
        <ProductSearchBox autoFocus onPick={(p, scan) => add(p, scan?.packageId)} />
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <EmptyState icon={<Tag size={26} />} title={t("labels.empty")} subtitle={t("labels.emptySubtitle")} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("stock.table.product")}</th>
                  <th>{t("products.drawer.barcode")}</th>
                  <th className="table-cell-num">{t("products.table.salePrice")}</th>
                  <th className="table-cell-num">{t("labels.copies")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.key}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.name}</div>
                      {row.subtitle && <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>{row.subtitle}</div>}
                    </td>
                    <td className={row.barcode ? "mono-num" : "text-danger"}>{row.barcode ?? t("labels.noBarcode")}</td>
                    <td className="table-cell-num">{formatMoney(row.price)}</td>
                    <td className="table-cell-num">
                      <input
                        type="number"
                        min={0}
                        max={500}
                        className="input doc-input"
                        style={{ width: 80, textAlign: "right" }}
                        value={row.copies}
                        onChange={(e) =>
                          setRows((prev) => prev.map((r, i) => (i === index ? { ...r, copies: Math.max(0, Math.min(500, Math.floor(Number(e.target.value) || 0))) } : r)))
                        }
                      />
                    </td>
                    <td className="table-cell-num">
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>
                        <Trash2 size={15} color="var(--color-danger-text)" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
