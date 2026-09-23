import { z } from "zod";

export const saleItemSchema = z.object({
  productId: z.string().min(1),
  // In package units when packageId is set, otherwise in the product's unit.
  quantity: z.coerce.number().positive("Саны 0дон чоң болушу керек"),
  // One IMEI / serial number per unit, for products with requiresSerial.
  serialNumbers: z.array(z.string().trim().min(1).max(64)).max(500).optional(),
  packageId: z.string().optional().nullable(),
});

export const createSaleSchema = z
  .object({
    items: z.array(saleItemSchema).min(1, "Кеминде бир товар тандаңыз"),
    discount: z.coerce.number().nonnegative().default(0),
    paymentMethod: z.enum(["CASH", "CARD", "QR", "DEBT"]),
    customerId: z.string().optional().nullable(),
    locationId: z.string().optional().nullable(),
    priceLevel: z.enum(["RETAIL", "WHOLESALE"]).default("RETAIL"),
    // The cashier checked the prescription for prescription-only items.
    prescriptionConfirmed: z.boolean().default(false),
  })
  .refine((data) => data.paymentMethod !== "DEBT" || !!data.customerId, {
    message: "Карызга сатуу үчүн кардарды тандаңыз",
    path: ["customerId"],
  });

export const saleQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  // Receipt number or customer name.
  search: z.string().optional(),
  paymentMethod: z.enum(["CASH", "CARD", "QR", "DEBT"]).optional(),
  locationId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const createReturnSchema = z.object({
  items: z
    .array(
      z.object({
        saleItemId: z.string().min(1),
        // In the units the line was sold in (packages if it was sold by package).
        quantity: z.coerce.number().positive("Саны 0дон чоң болушу керек"),
        serialNumbers: z.array(z.string().trim().min(1)).optional(),
      }),
    )
    .min(1, "Кеминде бир товар тандаңыз"),
  refundMethod: z.enum(["CASH", "CARD", "QR", "DEBT"]),
  reason: z.string().trim().max(300).optional().nullable(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type SaleQuery = z.infer<typeof saleQuerySchema>;
export type CreateReturnInput = z.infer<typeof createReturnSchema>;
