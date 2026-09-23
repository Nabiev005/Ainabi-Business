import { z } from "zod";

export const productUnitEnum = z.enum(["PIECE", "KG", "GRAM", "LITER", "METER", "PACK", "BOX"]);

/** "" / null / undefined → null, anything else → number. */
const optionalMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().nonnegative().nullable(),
);

const optionalDate = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата туура эмес").nullable(),
);

export const productPackageSchema = z.object({
  name: z.string().trim().min(1, "Таңгактын атын жазыңыз").max(40),
  factor: z.coerce.number().positive("Таңгактагы саны 0дон чоң болушу керек"),
  barcode: z.string().trim().max(64).optional().nullable(),
  salePrice: optionalMoney.optional(),
});

export const productSchema = z.object({
  name: z.string().min(1, "Товар атын жазыңыз"),
  categoryId: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  purchasePrice: z.coerce.number().nonnegative("Сатып алуу баасы туура эмес"),
  salePrice: z.coerce.number().nonnegative("Сатуу баасы туура эмес"),
  wholesalePrice: optionalMoney.optional(),
  quantity: z.coerce.number().nonnegative().default(0),
  minQuantity: z.coerce.number().nonnegative().default(0),
  unit: productUnitEnum.default("PIECE"),
  imageUrl: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  // Values for the business's own product fields — checked against
  // Business.productFields in product.service (unknown keys are dropped).
  attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  requiresSerial: z.boolean().default(false),
  warrantyMonths: z.coerce.number().int().min(0).max(240).optional().nullable(),
  prescriptionRequired: z.boolean().default(false),
  scaleCode: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : String(v).trim()),
    z.string().regex(/^\d{5}$/, "Тараза коду 5 сандан турушу керек").nullable(),
  ).optional(),
  // undefined = leave packages as they are; [] = remove all.
  packages: z.array(productPackageSchema).max(10).optional(),
  // Initial stock only (create): where it lands and its batch.
  locationId: z.string().optional().nullable(),
  initialExpiryDate: optionalDate.optional(),
  initialBatchNumber: z.string().trim().max(60).optional().nullable(),
});

export const productQuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  stock: z.enum(["low", "out"]).optional(),
  // Adds locationQuantity (stock at this branch) to every product.
  locationId: z.string().optional(),
  variantGroupId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
});

export const variantGroupSchema = z.object({
  // Set when adding more variants to an existing group.
  groupId: z.string().optional(),
  name: z.string().trim().min(1, "Товар атын жазыңыз").max(120),
  categoryId: z.string().optional().nullable(),
  unit: productUnitEnum.default("PIECE"),
  purchasePrice: z.coerce.number().nonnegative(),
  salePrice: z.coerce.number().nonnegative(),
  wholesalePrice: optionalMoney.optional(),
  minQuantity: z.coerce.number().nonnegative().default(0),
  description: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  requiresSerial: z.boolean().default(false),
  warrantyMonths: z.coerce.number().int().min(0).max(240).optional().nullable(),
  locationId: z.string().optional().nullable(),
  dimensions: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        values: z.array(z.string().trim().min(1).max(40)).min(1).max(40),
      }),
    )
    .min(1, "Кеминде бир вариант өлчөмүн кошуңуз")
    .max(3),
  variants: z
    .array(
      z.object({
        options: z.record(z.string()),
        quantity: z.coerce.number().nonnegative().default(0),
        purchasePrice: optionalMoney.optional(),
        salePrice: optionalMoney.optional(),
        barcode: z.string().trim().max(64).optional().nullable(),
        sku: z.string().trim().max(64).optional().nullable(),
      }),
    )
    .min(1, "Кеминде бир вариант тандаңыз")
    .max(200),
});

export const analogsSchema = z.object({
  analogIds: z.array(z.string()).max(50),
});

export const importSchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1).max(500, "Бир жолу эң көп 500 сап жүктөөгө болот"),
  updateExisting: z.boolean().default(true),
  locationId: z.string().optional().nullable(),
});

export type ProductInput = z.infer<typeof productSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
export type VariantGroupInput = z.infer<typeof variantGroupSchema>;
export type ImportInput = z.infer<typeof importSchema>;
