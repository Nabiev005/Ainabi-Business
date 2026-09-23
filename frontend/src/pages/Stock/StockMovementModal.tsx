import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../components/ui/Modal";
import type { Location, Product } from "../../types";
import type { CreateMovementPayload, ManualMovementType } from "../../services/stock.service";

interface StockMovementModalProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  defaultType: ManualMovementType;
  submitting: boolean;
  onSubmit: (values: CreateMovementPayload) => Promise<void>;
  /** Only passed when the business has more than one branch. */
  locations?: Location[];
  trackExpiry?: boolean;
}

export function StockMovementModal({
  open,
  onClose,
  products,
  defaultType,
  submitting,
  onSubmit,
  locations = [],
  trackExpiry = false,
}: StockMovementModalProps) {
  const { t } = useTranslation();
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<ManualMovementType>(defaultType);
  const [quantity, setQuantity] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [comment, setComment] = useState("");
  const [locationId, setLocationId] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [batchNumber, setBatchNumber] = useState("");

  const TYPE_OPTIONS: { value: ManualMovementType; label: string }[] = [
    { value: "IN", label: t("stock.modal.types.IN") },
    { value: "OUT", label: t("stock.modal.types.OUT") },
    { value: "WRITE_OFF", label: t("stock.modal.types.WRITE_OFF") },
    { value: "ADJUSTMENT", label: t("stock.modal.types.ADJUSTMENT") },
  ];

  useEffect(() => {
    if (open) {
      setProductId("");
      setType(defaultType);
      setQuantity("");
      setPurchasePrice("");
      setComment("");
      setLocationId("");
      setExpiryDate("");
      setBatchNumber("");
    }
  }, [open, defaultType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || !quantity) return;
    await onSubmit({
      productId,
      type,
      quantity: Number(quantity),
      purchasePrice: purchasePrice ? Number(purchasePrice) : undefined,
      comment: comment || undefined,
      locationId: locationId || null,
      expiryDate: type === "IN" && expiryDate ? expiryDate : null,
      batchNumber: type === "IN" && batchNumber ? batchNumber : null,
    });
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form className="stack gap-4" onSubmit={handleSubmit}>
        <h2 className="card-title">{t("stock.modal.title")}</h2>

        <div className="field">
          <label className="field-label">{t("stock.modal.actionType")}</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as ManualMovementType)}>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {locations.length > 1 && (
          <div className="field">
            <label className="field-label">{t("stock.modal.location")}</label>
            <select className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">{t("stock.modal.myLocation")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label className="field-label">{t("stock.modal.product")}</label>
          <select className="select" value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">{t("stock.modal.productPlaceholder")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({t("stock.modal.productCurrent", { qty: p.quantity })})
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("stock.modal.quantity")}</label>
            <input type="number" min={0.001} step="0.001" className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </div>
          {type === "IN" && (
            <div className="field">
              <label className="field-label">{t("stock.modal.purchasePrice")}</label>
              <input type="number" min={0} step="0.01" className="input" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder={t("stock.modal.pricePlaceholder")} />
            </div>
          )}
        </div>

        {type === "IN" && trackExpiry && (
          <div className="form-grid">
            <div className="field">
              <label className="field-label">{t("stock.modal.expiryDate")}</label>
              <input type="date" className="input" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">{t("stock.modal.batchNumber")}</label>
              <input className="input" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
            </div>
          </div>
        )}

        <div className="field">
          <label className="field-label">{t("stock.modal.supplierComment")}</label>
          <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("stock.modal.commentPlaceholder")} />
        </div>

        <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
