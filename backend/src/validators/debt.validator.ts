import { z } from "zod";
import { LIMITS } from "./common";

export const createDebtSchema = z.object({
  customerId: z.string().min(1, "Кардарды тандаңыз"),
  totalAmount: z.coerce.number().positive("Сумма 0дон чоң болушу керек"),
  comment: z.string().max(LIMITS.comment).optional().nullable(),
});

export const createDebtPaymentSchema = z.object({
  amount: z.coerce.number().positive("Төлөм суммасы 0дон чоң болушу керек"),
  method: z.enum(["CASH", "CARD", "QR"]).default("CASH"),
  comment: z.string().max(LIMITS.comment).optional().nullable(),
});

export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type CreateDebtPaymentInput = z.infer<typeof createDebtPaymentSchema>;
