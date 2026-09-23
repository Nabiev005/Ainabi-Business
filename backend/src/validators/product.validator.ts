import { z } from "zod";

export const productUnitEnum = z.enum(["PIECE", "KG", "GRAM", "LITER", "METER", "PACK", "BOX"]);

export const productSchema = z.object({
  name: z.string().min(1, "Товар атын жазыңыз"),
  categoryId: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  purchasePrice: z.coerce.number().nonnegative("Сатып алуу баасы туура эмес"),
  salePrice: z.coerce.number().nonnegative("Сатуу баасы туура эмес"),
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
});

export const productQuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  stock: z.enum(["low", "out"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type ProductInput = z.infer<typeof productSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
