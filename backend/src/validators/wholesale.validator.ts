import { z } from "zod";
import { LIMITS } from "./common";

export const wholesaleSettingsSchema = z.object({
  enabled: z.boolean(),
  note: z.string().trim().max(LIMITS.comment).optional().nullable(),
});

export const createWholesaleOrderSchema = z.object({
  sellerBusinessId: z.string().min(1),
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().positive("Саны 0дон чоң болушу керек").max(1_000_000) }))
    .min(1, "Кеминде бир товар тандаңыз")
    .max(200),
  comment: z.string().trim().max(LIMITS.comment).optional().nullable(),
});

export const wholesaleStatusSchema = z.object({
  status: z.enum(["ACCEPTED", "REJECTED", "SHIPPED", "RECEIVED", "CANCELLED"]),
  note: z.string().trim().max(LIMITS.comment).optional().nullable(),
  // Seller, on SHIPPED: also record it as a sale.
  recordSale: z.boolean().default(false),
  paymentMethod: z.enum(["CASH", "CARD", "QR"]).optional(),
  // Buyer, on RECEIVED: also book the goods in.
  createReceipt: z.boolean().default(false),
});

export type CreateWholesaleOrderInput = z.infer<typeof createWholesaleOrderSchema>;
export type WholesaleStatusInput = z.infer<typeof wholesaleStatusSchema>;
