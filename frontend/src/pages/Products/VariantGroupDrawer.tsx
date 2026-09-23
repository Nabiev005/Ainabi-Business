import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Drawer } from "../../components/ui/Drawer";
import { useToast } from "../../hooks/useToast";
import * as productService from "../../services/product.service";
import { extractErrorMessage } from "../../services/api";
import type { Category, ProductUnit, VariantDimension } from "../../types";

interface Dimension {
  name: string;
  valuesText: string;
}

interface VariantCell {
  include: boolean;
  quantity: string;
  salePrice: string;
  barcode: string;
}

function values(dim: Dimension) {
  return [...new Set(dim.valuesText.split(",").map((v) => v.trim()).filter(Boolean))];
}

/** Every combination of the dimensions' values: S/Кара, S/Ак, M/Кара ... */
function combinations(dims: VariantDimension[]): Record<string, string>[] {
  return dims.reduce<Record<string, string>[]>(
    (acc, dim) => acc.flatMap((combo) => dim.values.map((v) => ({ ...combo, [dim.name]: v }))),
    [{}],
  );
}

/**
 * One product in several sizes/colours: each combination becomes its own
 * product (own stock, barcode, price) grouped together, so the POS shows a
 * single card with a size/colour picker.
 */
export function VariantGroupDrawer({ open, onClose, onDone, categories }: { open: boolean; onClose: () => void; onDone: () => void; categories: Category[] }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState<ProductUnit>("PIECE");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [dims, setDims] = useState<Dimension[]>([]);
  const [cells, setCells] = useState<Record<string, VariantCell>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setCategoryId("");
      setUnit("PIECE");
      setPurchasePrice("");
      setSalePrice("");
      setDims([
        { name: t("products.variants.sizeName"), valuesText: "S, M, L, XL" },
        { name: t("products.variants.colorName"), valuesText: "" },
      ]);
      setCells({});
    }
  }, [open, t]);

  const dimensions: VariantDimension[] = useMemo(
    () => dims.filter((d) => d.name.trim() && values(d).length > 0).map((d) => ({ name: d.name.trim(), values: values(d) })),
    [dims],
  );
  const combos = useMemo(() => (dimensions.length ? combinations(dimensions) : []), [dimensions]);
  const labelOf = (combo: Record<string, string>) => dimensions.map((d) => combo[d.name]).join(" / ");
  const cellOf = (label: string): VariantCell => cells[label] ?? { include: true, quantity: "", salePrice: "", barcode: "" };
  const setCell = (label: string, patch: Partial<VariantCell>) => setCells((prev) => ({ ...prev, [label]: { ...cellOf(label), ...patch } }));

  async function submit() {
    const variants = combos
      .filter((combo) => cellOf(labelOf(combo)).include)
      .map((combo) => {
        const cell = cellOf(labelOf(combo));
        return {
          options: combo,
          quantity: Number(cell.quantity) || 0,
          salePrice: cell.salePrice ? Number(cell.salePrice) : null,
          barcode: cell.barcode || null,
        };
      });
    if (!name.trim() || variants.length === 0 || salePrice === "") return;
    setSaving(true);
    try {
      const result = await productService.createVariantGroup({
        name: name.trim(),
        categoryId: categoryId || null,
        unit,
        purchasePrice: Number(purchasePrice) || 0,
        salePrice: Number(salePrice) || 0,
        minQuantity: 0,
        dimensions,
        variants,
      });
      showToast({ variant: "success", title: t("products.variants.created", { count: result.created.length }) });
      onDone();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  const included = combos.filter((c) => cellOf(labelOf(c)).include).length;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("products.variants.title")}
      subtitle={t("products.variants.subtitle")}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !name.trim() || included === 0 || salePrice === ""}>
            {saving ? t("common.saving") : t("products.variants.submit", { count: included })}
          </button>
        </>
      }
    >
      <div className="stack gap-4">
        <div className="field">
          <label className="field-label">{t("products.drawer.name")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("products.variants.namePlaceholder")} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("products.drawer.category")}</label>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t("products.drawer.categoryPlaceholder")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">{t("products.drawer.unit")}</label>
            <select className="select" value={unit} onChange={(e) => setUnit(e.target.value as ProductUnit)}>
              {(["PIECE", "PACK", "BOX", "KG", "GRAM", "LITER", "METER"] as ProductUnit[]).map((u) => (
                <option key={u} value={u}>
                  {t(`products.units.${u}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("products.drawer.purchasePrice")}</label>
            <input type="number" min={0} className="input" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">{t("products.drawer.salePrice")}</label>
            <input type="number" min={0} className="input" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          </div>
        </div>

        <div className="product-attr-section">
          <div className="product-attr-title">{t("products.variants.dimensions")}</div>
          {dims.map((dim, index) => (
            <div key={index} className="row gap-2">
              <input
                className="input"
                style={{ width: 130 }}
                value={dim.name}
                onChange={(e) => setDims((prev) => prev.map((d, i) => (i === index ? { ...d, name: e.target.value } : d)))}
              />
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder={t("products.variants.valuesPlaceholder")}
                value={dim.valuesText}
                onChange={(e) => setDims((prev) => prev.map((d, i) => (i === index ? { ...d, valuesText: e.target.value } : d)))}
              />
              <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setDims((prev) => prev.filter((_, i) => i !== index))}>
                <Trash2 size={14} color="var(--color-danger-text)" />
              </button>
            </div>
          ))}
          {dims.length < 3 && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setDims((prev) => [...prev, { name: "", valuesText: "" }])}>
              <Plus size={14} /> {t("products.variants.addDimension")}
            </button>
          )}
        </div>

        {combos.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  <th>{t("products.variants.variant")}</th>
                  <th className="table-cell-num">{t("products.drawer.initialStock")}</th>
                  <th className="table-cell-num">{t("products.drawer.salePrice")}</th>
                  <th>{t("products.drawer.barcode")}</th>
                </tr>
              </thead>
              <tbody>
                {combos.map((combo) => {
                  const label = labelOf(combo);
                  const cell = cellOf(label);
                  return (
                    <tr key={label} style={cell.include ? undefined : { opacity: 0.45 }}>
                      <td>
                        <input type="checkbox" checked={cell.include} onChange={(e) => setCell(label, { include: e.target.checked })} />
                      </td>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{label}</td>
                      <td className="table-cell-num">
                        <input type="number" min={0} className="input doc-input" style={{ width: 70 }} value={cell.quantity} onChange={(e) => setCell(label, { quantity: e.target.value })} />
                      </td>
                      <td className="table-cell-num">
                        <input
                          type="number"
                          min={0}
                          className="input doc-input"
                          style={{ width: 90 }}
                          placeholder={salePrice}
                          value={cell.salePrice}
                          onChange={(e) => setCell(label, { salePrice: e.target.value })}
                        />
                      </td>
                      <td>
                        <input className="input doc-input" style={{ width: 130 }} placeholder={t("products.variants.autoBarcode")} value={cell.barcode} onChange={(e) => setCell(label, { barcode: e.target.value })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Drawer>
  );
}
