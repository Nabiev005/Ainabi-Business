import { z } from "zod";

export const stockMovementTypeEnum = z.enum(["IN", "OUT", "ADJUSTMENT", "WRITE_OFF"]);

const optionalDate = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата туура эмес").nullable(),
);

export const createStockMovementSchema = z.object({
  productId: z.string().min(1),
  type: stockMovementTypeEnum,
  quantity: z.coerce.number().positive("Саны 0дон чоң болушу керек"),
  purchasePrice: z.coerce.number().nonnegative().optional(),
  supplierId: z.string().optional().nullable(),
  comment: z.string().optional().nullable(),
  locationId: z.string().optional().nullable(),
  expiryDate: optionalDate.optional(),
  batchNumber: z.string().trim().max(60).optional().nullable(),
});

export const stockQuerySchema = z.object({
  type: stockMovementTypeEnum.or(z.enum(["SALE", "RETURN", "TRANSFER"])).optional(),
  productId: z.string().optional(),
  locationId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(30),
});

export const receiptItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive("Саны 0дон чоң болушу керек"),
  purchasePrice: z.coerce.number().nonnegative("Сатып алуу баасы туура эмес"),
  // Optional new shelf price, applied to the product.
  salePrice: z.coerce.number().nonnegative().optional().nullable(),
  batchNumber: z.string().trim().max(60).optional().nullable(),
  expiryDate: optionalDate.optional(),
  serialNumbers: z.array(z.string().trim().min(1).max(64)).max(500).optional(),
});

export const createReceiptSchema = z
  .object({
    type: z.enum(["PURCHASE", "TRADE_IN"]).default("PURCHASE"),
    supplierId: z.string().optional().nullable(),
    customerId: z.string().optional().nullable(),
    sellerName: z.string().trim().max(120).optional().nullable(),
    locationId: z.string().optional().nullable(),
    docNumber: z.string().trim().max(60).optional().nullable(),
    comment: z.string().trim().max(500).optional().nullable(),
    items: z.array(receiptItemSchema).min(1, "Кеминде бир товар тандаңыз").max(500),
    // Paid right now; for a supplier the rest can become a supplier debt.
    paidAmount: z.coerce.number().nonnegative().optional(),
    paymentMethod: z.enum(["CASH", "CARD", "QR"]).default("CASH"),
    createSupplierDebt: z.boolean().default(true),
  })
  .refine((d) => d.type !== "TRADE_IN" || !!d.customerId || !!d.sellerName, {
    message: "Сатып жаткан адамды көрсөтүңүз",
    path: ["sellerName"],
  });

export const listDocumentsQuerySchema = z.object({
  type: z.enum(["PURCHASE", "TRADE_IN"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const inventoryCountSchema = z.object({
  locationId: z.string().optional().nullable(),
  comment: z.string().trim().max(500).optional().nullable(),
  items: z
    .array(z.object({ productId: z.string().min(1), countedQty: z.coerce.number().nonnegative("Саны терс болбошу керек") }))
    .min(1, "Кеминде бир товар санаңыз")
    .max(5000),
});

export const transferSchema = z
  .object({
    fromLocationId: z.string().min(1),
    toLocationId: z.string().min(1),
    comment: z.string().trim().max(500).optional().nullable(),
    items: z
      .array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().positive("Саны 0дон чоң болушу керек") }))
      .min(1, "Кеминде бир товар тандаңыз")
      .max(500),
  })
  .refine((d) => d.fromLocationId !== d.toLocationId, { message: "Филиалдар ар башка болушу керек", path: ["toLocationId"] });

export const expiringQuerySchema = z.object({
  days: z.coerce.number().int().min(0).max(365).default(30),
});

export const writeOffBatchSchema = z.object({
  locationId: z.string().optional().nullable(),
});

export type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>;
export type StockQuery = z.infer<typeof stockQuerySchema>;
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type InventoryCountInput = z.infer<typeof inventoryCountSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
