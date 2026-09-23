import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Image as ImageIcon, Link2, Loader2, Trash2, Upload } from "lucide-react";
import { Drawer } from "../../components/ui/Drawer";
import type { AttributeValue, Category, Product, ProductFieldDef, ProductUnit } from "../../types";
import { useAuth } from "../../hooks/useAuth";
import { formatMoney } from "../../utils/format";
import { generateBarcodeFromSku } from "../../utils/barcode";
import { resizeImageToDataUrl } from "../../utils/image";
import { useToast } from "../../hooks/useToast";
import "./Products.css";

// A generous cap on the *original* file — it gets resized/compressed well
// below this before ever touching the imageUrl field or the network.
const MAX_IMAGE_FILE_BYTES = 12 * 1024 * 1024;

interface ProductDrawerProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  categories: Category[];
  product?: Product | null;
  submitting: boolean;
}

export interface ProductFormValues {
  name: string;
  categoryId?: string;
  sku?: string;
  barcode?: string;
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  minQuantity: number;
  unit: ProductUnit;
  imageUrl?: string;
  description?: string;
  attributes?: Record<string, AttributeValue | null>;
  requiresSerial?: boolean;
  warrantyMonths?: number | null;
}

/** Form inputs hand back strings — turn them into the typed values the
 * API expects (numbers for number fields, null for anything left blank). */
function normalizeAttributes(fields: ProductFieldDef[], raw: Record<string, unknown> | undefined) {
  const result: Record<string, AttributeValue | null> = {};
  for (const field of fields) {
    const value = raw?.[field.key];
    if (field.type === "boolean") {
      result[field.key] = value === true;
    } else if (value === undefined || value === null || String(value).trim() === "") {
      result[field.key] = null;
    } else {
      result[field.key] = field.type === "number" ? Number(value) : String(value).trim();
    }
  }
  return result;
}

function AttributeInput({ field, register }: { field: ProductFieldDef; register: ReturnType<typeof useForm<ProductFormValues>>["register"] }) {
  const { t } = useTranslation();
  const name = `attributes.${field.key}` as const;
  switch (field.type) {
    case "select":
      return (
        <select className="select" {...register(name)}>
          <option value="">{t("products.drawer.attributeSelect")}</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "boolean":
      return (
        <label className="product-attr-check">
          <input type="checkbox" {...register(name)} />
          {t("common.yes")}
        </label>
      );
    case "number":
      return <input type="number" step="any" className="input" {...register(name)} />;
    case "date":
      return <input type="date" className="input" {...register(name)} />;
    default:
      return <input className="input" {...register(name)} />;
  }
}

export function ProductDrawer({ open, onClose, onSubmit, categories, product, submitting }: ProductDrawerProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [imageProcessing, setImageProcessing] = useState(false);
  const { session } = useAuth();
  const productFields = useMemo(() => session?.business.productFields ?? [], [session?.business.productFields]);
  const trackSerials = !!session?.business.trackSerials;
  const trackWarranty = !!session?.business.trackWarranty;

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, t("products.drawer.nameRequired")),
        categoryId: z.string().optional(),
        sku: z.string().optional(),
        barcode: z.string().optional(),
        purchasePrice: z.coerce.number().nonnegative(t("products.drawer.purchasePriceRequired")),
        salePrice: z.coerce.number().nonnegative(t("products.drawer.salePriceRequired")),
        quantity: z.coerce.number().nonnegative(),
        minQuantity: z.coerce.number().nonnegative(),
        unit: z.enum(["PIECE", "KG", "GRAM", "LITER", "METER", "PACK", "BOX"]),
        imageUrl: z.string().optional(),
        description: z.string().optional(),
        attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
        requiresSerial: z.boolean().optional(),
        warrantyMonths: z.preprocess(
          (v) => (v === "" || v === undefined || v === null || Number.isNaN(v) ? null : Number(v)),
          z.number().int().min(0).max(240).nullable(),
        ),
      })
      .superRefine((values, ctx) => {
        for (const field of productFields) {
          if (!field.required || field.type === "boolean") continue;
          const value = values.attributes?.[field.key];
          if (value === undefined || value === null || String(value).trim() === "") {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["attributes", field.key], message: t("products.drawer.attributeRequired") });
          }
        }
      }),
    [t, productFields],
  );

  const UNIT_OPTIONS: { value: ProductUnit; label: string }[] = [
    { value: "PIECE", label: t("products.units.PIECE") },
    { value: "KG", label: t("products.units.KG") },
    { value: "GRAM", label: t("products.units.GRAM") },
    { value: "LITER", label: t("products.units.LITER") },
    { value: "METER", label: t("products.units.METER") },
    { value: "PACK", label: t("products.units.PACK") },
    { value: "BOX", label: t("products.units.BOX") },
  ];

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { unit: "PIECE", quantity: 0, minQuantity: 0 },
  });

  // Tracks the last barcode *we* auto-filled, so we only keep overwriting it
  // while the user hasn't typed their own — never touches a barcode that
  // was already there (typed by hand, or loaded from an existing product).
  const lastAutoBarcode = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      lastAutoBarcode.current = undefined;
      // A previously-uploaded image is stored as a data: URL, which isn't
      // something a person would want to see/edit as text — only reveal the
      // manual-URL field by default when the existing value is a real link.
      setShowUrlInput(!!product?.imageUrl && !product.imageUrl.startsWith("data:"));
      reset(
        product
          ? {
              name: product.name,
              categoryId: product.categoryId ?? undefined,
              sku: product.sku ?? undefined,
              barcode: product.barcode ?? undefined,
              purchasePrice: product.purchasePrice,
              salePrice: product.salePrice,
              quantity: product.quantity,
              minQuantity: product.minQuantity,
              unit: product.unit,
              imageUrl: product.imageUrl ?? undefined,
              description: product.description ?? undefined,
              // Everything but checkboxes goes through text inputs.
              attributes: Object.fromEntries(
                Object.entries(product.attributes ?? {}).map(([k, v]) => [k, typeof v === "boolean" ? v : String(v)]),
              ),
              requiresSerial: product.requiresSerial,
              warrantyMonths: product.warrantyMonths,
            }
          : { unit: "PIECE", quantity: 0, minQuantity: 0, attributes: {}, requiresSerial: trackSerials, warrantyMonths: null },
      );
    }
  }, [open, product, reset, trackSerials]);

  const submit = handleSubmit((values) =>
    onSubmit({
      ...values,
      attributes: normalizeAttributes(productFields, values.attributes),
      requiresSerial: trackSerials ? !!values.requiresSerial : false,
      warrantyMonths: trackWarranty ? (values.warrantyMonths ?? null) : null,
    }),
  );

  const [purchasePrice, salePrice, skuValue, barcodeValue, imageUrlValue] = watch(["purchasePrice", "salePrice", "sku", "barcode", "imageUrl"]);

  async function handleImageFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast({ variant: "error", title: t("products.drawer.imageInvalidType") });
      return;
    }
    if (file.size > MAX_IMAGE_FILE_BYTES) {
      showToast({ variant: "error", title: t("products.drawer.imageTooLarge") });
      return;
    }
    setImageProcessing(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setValue("imageUrl", dataUrl, { shouldDirty: true });
    } catch {
      showToast({ variant: "error", title: t("products.drawer.imageProcessFailed") });
    } finally {
      setImageProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }
  const profit = (Number(salePrice) || 0) - (Number(purchasePrice) || 0);
  const margin = Number(purchasePrice) > 0 ? Math.round((profit / Number(purchasePrice)) * 1000) / 10 : 0;

  useEffect(() => {
    if (!open) return;
    if (!skuValue) return;
    if (barcodeValue && barcodeValue !== lastAutoBarcode.current) return; // user typed their own — don't touch it
    const generated = generateBarcodeFromSku(skuValue);
    lastAutoBarcode.current = generated;
    setValue("barcode", generated, { shouldValidate: false, shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuValue, open]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={product ? t("products.drawer.editTitle") : t("products.drawer.addTitle")}
      subtitle={product ? product.name : t("products.drawer.addSubtitle")}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? t("common.saving") : product ? t("common.save") : t("products.drawer.submitAdd")}
          </button>
        </>
      }
    >
      <form className="stack gap-4" onSubmit={submit}>
        <div className="field">
          <label className="field-label">{t("products.drawer.name")}</label>
          <input className={`input ${errors.name ? "has-error" : ""}`} placeholder={t("products.drawer.namePlaceholder")} {...register("name")} />
          {errors.name && <span className="field-error">{errors.name.message}</span>}
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("products.drawer.category")}</label>
            <select className="select" {...register("categoryId")}>
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
            <select className="select" {...register("unit")}>
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("products.drawer.sku")}</label>
            <input className="input" placeholder="SKU-0001" {...register("sku")} />
            {!skuValue && !product && <span className="field-hint">{t("products.drawer.skuAutoHint")}</span>}
          </div>
          <div className="field">
            <label className="field-label">{t("products.drawer.barcode")}</label>
            <input className="input" placeholder="4870001234561" {...register("barcode")} />
            {skuValue && barcodeValue === lastAutoBarcode.current && (
              <span className="field-hint">{t("products.drawer.barcodeAutoHint")}</span>
            )}
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("products.drawer.purchasePrice")}</label>
            <input type="number" step="0.01" className={`input ${errors.purchasePrice ? "has-error" : ""}`} {...register("purchasePrice")} />
            {errors.purchasePrice && <span className="field-error">{errors.purchasePrice.message}</span>}
          </div>
          <div className="field">
            <label className="field-label">{t("products.drawer.salePrice")}</label>
            <input type="number" step="0.01" className={`input ${errors.salePrice ? "has-error" : ""}`} {...register("salePrice")} />
            {errors.salePrice && <span className="field-error">{errors.salePrice.message}</span>}
          </div>
        </div>

        <div className="margin-preview">
          <div className="margin-preview-item">
            <div className="margin-preview-value">{formatMoney(profit)}</div>
            <div className="margin-preview-label">{t("products.drawer.profit")}</div>
          </div>
          <div className="margin-preview-item">
            <div className="margin-preview-value">{margin}%</div>
            <div className="margin-preview-label">{t("products.drawer.margin")}</div>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="field-label">{product ? t("products.drawer.currentStock") : t("products.drawer.initialStock")}</label>
            <input type="number" step="0.01" className="input" disabled={!!product} {...register("quantity")} />
            {product && <span className="field-hint">{t("products.drawer.stockHint")}</span>}
          </div>
          <div className="field">
            <label className="field-label">{t("products.drawer.minStock")}</label>
            <input type="number" step="0.01" className="input" {...register("minQuantity")} />
          </div>
        </div>

        {productFields.length > 0 && (
          <div className="product-attr-section">
            <div className="product-attr-title">{t("products.drawer.attributesTitle")}</div>
            <div className="form-grid">
              {productFields.map((field) => (
                <div className="field" key={field.key}>
                  <label className="field-label">
                    {field.label}
                    {field.required && field.type !== "boolean" && <span style={{ color: "var(--color-danger-text)" }}> *</span>}
                  </label>
                  <AttributeInput field={field} register={register} />
                  {errors.attributes?.[field.key] && <span className="field-error">{t("products.drawer.attributeRequired")}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {(trackSerials || trackWarranty) && (
          <div className="form-grid">
            {trackSerials && (
              <div className="field">
                <label className="product-attr-check" style={{ marginTop: 22 }}>
                  <input type="checkbox" {...register("requiresSerial")} />
                  {t("products.drawer.requiresSerial")}
                </label>
                <span className="field-hint">{t("products.drawer.requiresSerialHint")}</span>
              </div>
            )}
            {trackWarranty && (
              <div className="field">
                <label className="field-label">{t("products.drawer.warrantyMonths")}</label>
                <input type="number" min={0} max={240} step={1} className="input" placeholder="12" {...register("warrantyMonths")} />
                {errors.warrantyMonths && <span className="field-error">{t("products.drawer.warrantyInvalid")}</span>}
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label className="field-label">{t("products.drawer.image")}</label>
          <div className="product-image-field">
            <div className="product-image-preview">
              {imageProcessing ? (
                <Loader2 size={22} className="spin" />
              ) : imageUrlValue ? (
                <img src={imageUrlValue} alt="" />
              ) : (
                <ImageIcon size={22} />
              )}
            </div>
            <div className="product-image-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleImageFile(e.target.files?.[0])}
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={imageProcessing}>
                <Upload size={14} /> {t("products.drawer.imageUpload")}
              </button>
              <div className="row gap-3">
                {imageUrlValue && (
                  <button
                    type="button"
                    className="product-image-link-btn"
                    onClick={() => setValue("imageUrl", "", { shouldDirty: true })}
                  >
                    <Trash2 size={13} /> {t("products.drawer.imageRemove")}
                  </button>
                )}
                <button
                  type="button"
                  className="product-image-link-btn"
                  onClick={() => {
                    // A data: URL is a huge string — no point showing it in a
                    // text box, so opening the manual-link field starts fresh.
                    if (!showUrlInput && imageUrlValue?.startsWith("data:")) {
                      setValue("imageUrl", "", { shouldDirty: true });
                    }
                    setShowUrlInput((v) => !v);
                  }}
                >
                  <Link2 size={13} /> {t("products.drawer.imageUseUrl")}
                </button>
              </div>
            </div>
          </div>
          {showUrlInput && (
            <input className="input" style={{ marginTop: "var(--space-2)" }} placeholder="https://..." {...register("imageUrl")} />
          )}
        </div>

        <div className="field">
          <label className="field-label">{t("products.drawer.description")}</label>
          <textarea className="textarea" placeholder={t("products.drawer.descriptionPlaceholder")} {...register("description")} />
        </div>
      </form>
    </Drawer>
  );
}
