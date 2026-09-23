import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Package, Plus, Trash2, X } from "lucide-react";
import { ProductSearchBox } from "../../components/ProductSearchBox";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../hooks/useToast";
import * as productService from "../../services/product.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatMoney, formatNumber, unitLabel } from "../../utils/format";
import type { Product, ProductBatch, ProductPackage, ProductSerialUnit, ProductUnit } from "../../types";

/** Alternative selling units: "Мешок = 50 кг", "Блок = 10 пачка", "Пластинка = 0.1 кутуча". */
export function PackagesEditor({
  packages,
  onChange,
  unit,
  salePrice,
}: {
  packages: ProductPackage[];
  onChange: (packages: ProductPackage[]) => void;
  unit: ProductUnit;
  salePrice: number;
}) {
  const { t } = useTranslation();
  const update = (index: number, patch: Partial<ProductPackage>) => onChange(packages.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  return (
    <div className="product-attr-section">
      <div className="row gap-2">
        <div className="product-attr-title" style={{ flex: 1 }}>
          <Package size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
          {t("products.packages.title")}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onChange([...packages, { name: "", factor: 1, barcode: null, salePrice: null }])}
          disabled={packages.length >= 10}
        >
          <Plus size={14} /> {t("products.packages.add")}
        </button>
      </div>
      {packages.length === 0 ? (
        <span className="field-hint">{t("products.packages.hint", { unit: unitLabel(unit) })}</span>
      ) : (
        packages.map((pkg, index) => (
          <div key={index} className="package-row">
            <input className="input" placeholder={t("products.packages.namePlaceholder")} value={pkg.name} onChange={(e) => update(index, { name: e.target.value })} />
            <div className="input-suffix">
              <input
                type="number"
                min={0}
                step="any"
                className="input"
                value={pkg.factor || ""}
                onChange={(e) => update(index, { factor: Number(e.target.value) })}
                title={t("products.packages.factor")}
              />
              <span>{unitLabel(unit)}</span>
            </div>
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              placeholder={formatMoney(salePrice * (pkg.factor || 0))}
              value={pkg.salePrice ?? ""}
              onChange={(e) => update(index, { salePrice: e.target.value === "" ? null : Number(e.target.value) })}
              title={t("products.packages.price")}
            />
            <input
              className="input"
              placeholder={t("products.packages.barcode")}
              value={pkg.barcode ?? ""}
              onChange={(e) => update(index, { barcode: e.target.value || null })}
            />
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onChange(packages.filter((_, i) => i !== index))}>
              <Trash2 size={14} color="var(--color-danger-text)" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/** Interchangeable products (same part from another maker) — shown at the POS when this one runs out. */
export function AnalogsSection({ product }: { product: Product }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [analogs, setAnalogs] = useState<Product[] | null>(null);

  useEffect(() => {
    productService.getAnalogs(product.id).then(setAnalogs).catch(() => setAnalogs([]));
  }, [product.id]);

  async function save(ids: string[]) {
    try {
      setAnalogs(await productService.setAnalogs(product.id, ids));
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    }
  }

  return (
    <div className="product-attr-section">
      <div className="product-attr-title">
        <Link2 size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
        {t("products.analogs.title")}
      </div>
      <span className="field-hint">{t("products.analogs.hint")}</span>
      {analogs && analogs.length > 0 && (
        <div className="chip-list">
          {analogs.map((a) => (
            <span key={a.id} className="chip">
              {a.name} · {formatNumber(a.quantity)} {unitLabel(a.unit)}
              <button type="button" onClick={() => save(analogs.filter((x) => x.id !== a.id).map((x) => x.id))} aria-label={t("common.delete")}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <ProductSearchBox
        placeholder={t("products.analogs.searchPlaceholder")}
        onPick={(picked) => {
          if (picked.id === product.id || analogs?.some((a) => a.id === picked.id)) return;
          save([...(analogs ?? []).map((a) => a.id), picked.id]);
        }}
      />
    </div>
  );
}

export function BatchesSection({ productId, unit }: { productId: string; unit: ProductUnit }) {
  const { t } = useTranslation();
  const [batches, setBatches] = useState<ProductBatch[] | null>(null);

  useEffect(() => {
    productService.listBatches(productId).then(setBatches).catch(() => setBatches([]));
  }, [productId]);

  const active = (batches ?? []).filter((b) => b.quantity > 0);
  if (!batches || active.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="product-attr-section">
      <div className="product-attr-title">{t("products.batches.title")}</div>
      {active.map((b) => (
        <div key={b.id} className="row gap-2" style={{ fontSize: "var(--font-size-sm)" }}>
          <span style={{ flex: 1 }}>{b.batchNumber ?? t("products.batches.noNumber")}</span>
          <span className="mono-num">
            {formatNumber(b.quantity)} {unitLabel(unit)}
          </span>
          {b.expiryDate && (
            <Badge variant={b.expiryDate.slice(0, 10) < today ? "danger" : "neutral"}>{formatDate(b.expiryDate)}</Badge>
          )}
        </div>
      ))}
    </div>
  );
}

export function SerialsSection({ productId }: { productId: string }) {
  const { t } = useTranslation();
  const [serials, setSerials] = useState<ProductSerialUnit[] | null>(null);

  useEffect(() => {
    productService.listSerials(productId, "IN_STOCK").then(setSerials).catch(() => setSerials([]));
  }, [productId]);

  if (!serials || serials.length === 0) return null;
  return (
    <div className="product-attr-section">
      <div className="product-attr-title">{t("products.serials.inStock", { count: serials.length })}</div>
      <div className="chip-list">
        {serials.map((s) => (
          <span key={s.id} className="chip mono-num">
            {s.serial}
          </span>
        ))}
      </div>
    </div>
  );
}
