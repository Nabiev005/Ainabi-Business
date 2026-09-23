import { z } from "zod";
import { BUSINESS_TYPE_IDS } from "../config/businessTemplates";

export const updateBusinessSchema = z.object({
  name: z.string().min(2, "Бизнес атын жазыңыз"),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  currency: z.string().min(1).default("KGS"),
  qrPaymentInfo: z.string().optional().nullable(),
});

export const businessTypeSchema = z.string().refine((v) => BUSINESS_TYPE_IDS.includes(v), "Бизнес түрү туура эмес");

export const productFieldSchema = z
  .object({
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/, "Талаа ачкычы туура эмес"),
    label: z.string().trim().min(1, "Талаанын атын жазыңыз").max(60),
    type: z.enum(["text", "number", "select", "boolean", "date"]),
    options: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
    required: z.boolean().default(false),
    showInList: z.boolean().default(false),
  })
  .refine((f) => f.type !== "select" || (f.options?.length ?? 0) > 0, {
    message: "Тизме түрүндөгү талаага кеминде бир вариант кошуңуз",
    path: ["options"],
  });

export const productFieldsSchema = z
  .array(productFieldSchema)
  .max(30, "Эң көп 30 талаа кошууга болот")
  .refine((fields) => new Set(fields.map((f) => f.key)).size === fields.length, "Талаалардын ачкычтары кайталанбашы керек");

export const updateProductConfigSchema = z.object({
  productFields: productFieldsSchema,
  trackSerials: z.boolean(),
  trackWarranty: z.boolean(),
  trackExpiry: z.boolean().optional(),
  enableRepairs: z.boolean().optional(),
  requireShift: z.boolean().optional(),
  weightBarcodes: z.boolean().optional(),
  checkPrescription: z.boolean().optional(),
});

export const locationSchema = z.object({
  name: z.string().trim().min(1, "Филиалдын атын жазыңыз").max(80),
  address: z.string().trim().max(200).optional().nullable(),
});

export const applyTemplateSchema = z.object({
  businessType: businessTypeSchema,
  addCategories: z.boolean().default(true),
  addFields: z.boolean().default(true),
});

export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type ProductFieldDef = z.infer<typeof productFieldSchema>;
export type UpdateProductConfigInput = z.infer<typeof updateProductConfigSchema>;
export type ApplyTemplateInput = z.infer<typeof applyTemplateSchema>;
export type LocationInput = z.infer<typeof locationSchema>;

/** Business.productFields is a Json column — read it back defensively so a
 * hand-edited/corrupt value degrades to "no custom fields", never a 500. */
export function parseProductFields(value: unknown): ProductFieldDef[] {
  const parsed = productFieldsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}
