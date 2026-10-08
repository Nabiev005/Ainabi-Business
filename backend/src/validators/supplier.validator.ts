import { z } from "zod";
import { LIMITS } from "./common";

export const supplierSchema = z.object({
  name: z.string().min(1, "Жеткирүүчүнүн атын жазыңыз").max(LIMITS.name),
  phone: z.string().max(LIMITS.phone).optional().nullable(),
  address: z.string().max(LIMITS.comment).optional().nullable(),
});

export const createSupplierDebtSchema = z.object({
  totalAmount: z.coerce.number().positive("Сумма 0дон чоң болушу керек"),
  comment: z.string().max(LIMITS.comment).optional().nullable(),
});

export const supplierPaymentSchema = z.object({
  amount: z.coerce.number().positive("Төлөм суммасы 0дон чоң болушу керек"),
  method: z.enum(["CASH", "CARD", "QR"]).default("CASH"),
  comment: z.string().max(LIMITS.comment).optional().nullable(),
});

export type SupplierInput = z.infer<typeof supplierSchema>;
export type CreateSupplierDebtInput = z.infer<typeof createSupplierDebtSchema>;
export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;
