import { z } from "zod";

export const saleItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive("Саны 0дон чоң болушу керек"),
  // One IMEI / serial number per unit, for products with requiresSerial.
  serialNumbers: z.array(z.string().trim().min(1).max(64)).max(500).optional(),
});

export const createSaleSchema = z
  .object({
    items: z.array(saleItemSchema).min(1, "Кеминде бир товар тандаңыз"),
    discount: z.coerce.number().nonnegative().default(0),
    paymentMethod: z.enum(["CASH", "CARD", "QR", "DEBT"]),
    customerId: z.string().optional().nullable(),
  })
  .refine((data) => data.paymentMethod !== "DEBT" || !!data.customerId, {
    message: "Карызга сатуу үчүн кардарды тандаңыз",
    path: ["customerId"],
  });

export const saleQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type SaleQuery = z.infer<typeof saleQuerySchema>;
