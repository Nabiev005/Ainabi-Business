import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, Trash2 } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { ProductSearchBox } from "../../components/ProductSearchBox";
import { useToast } from "../../hooks/useToast";
import * as stockService from "../../services/stock.service";
import { extractErrorMessage } from "../../services/api";
import { formatNumber, unitLabel } from "../../utils/format";
import type { Location, Product } from "../../types";

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  locations: Location[];
}

interface Line {
  product: Product;
  available: number;
  quantity: string;
}

/** Moves stock between branches; the business-wide total doesn't change. */
export function TransferModal({ open, onClose, onDone, locations }: TransferModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFromId(locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? "");
      setToId(locations.find((l) => !l.isDefault)?.id ?? "");
      setLines([]);
      setComment("");
    }
  }, [open, locations]);

  function addProduct(product: Product) {
    setLines((prev) =>
      prev.some((l) => l.product.id === product.id)
        ? prev
        : [...prev, { product, available: product.locationQuantity ?? 0, quantity: "1" }],
    );
  }

  async function submit() {
    const items = lines.map((l) => ({ productId: l.product.id, quantity: Number(l.quantity) })).filter((i) => i.quantity > 0);
    if (!fromId || !toId || items.length === 0) return;
    setSaving(true);
    try {
      await stockService.createTransfer({ fromLocationId: fromId, toLocationId: toId, comment: comment || null, items });
      showToast({ variant: "success", title: t("stock.transfer.done") });
      onDone();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="wide">
      <div className="stack gap-4">
        <h2 className="card-title">
          <ArrowLeftRight size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
          {t("stock.transfer.title")}
        </h2>
        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("stock.transfer.from")}</label>
            <select
              className="select"
              value={fromId}
              onChange={(e) => {
                setFromId(e.target.value);
                setLines([]);
              }}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">{t("stock.transfer.to")}</label>
            <select className="select" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">—</option>
              {locations
                .filter((l) => l.id !== fromId)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <ProductSearchBox locationId={fromId} onPick={(p) => addProduct(p)} />

        {lines.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("stock.table.product")}</th>
                  <th className="table-cell-num">{t("stock.transfer.available")}</th>
                  <th className="table-cell-num">{t("stock.table.quantity")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.product.id}>
                    <td style={{ fontWeight: 600 }}>{line.product.name}</td>
                    <td className="table-cell-num">
                      {formatNumber(line.available)} {unitLabel(line.product.unit)}
                    </td>
                    <td className="table-cell-num">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className={`input doc-input ${Number(line.quantity) > line.available ? "has-error" : ""}`}
                        style={{ width: 100, textAlign: "right" }}
                        value={line.quantity}
                        onChange={(e) => setLines((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: e.target.value } : l)))}
                      />
                    </td>
                    <td className="table-cell-num">
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}>
                        <Trash2 size={14} color="var(--color-danger-text)" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <input className="input" placeholder={t("stock.transfer.commentPlaceholder")} value={comment} onChange={(e) => setComment(e.target.value)} />

        <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !toId || lines.length === 0}>
            {saving ? t("common.saving") : t("stock.transfer.submit")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
