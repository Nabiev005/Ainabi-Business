import { z } from "zod";
import { LIMITS } from "./common";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата туура эмес");

/** Either one due date, or an installment plan (or neither). */
export const debtScheduleSchema = z.object({
  dueDate: day.optional().nullable(),
  installments: z
    .object({
      count: z.coerce.number().int().min(2, "Кеминде 2 төлөм").max(60, "Эң көп 60 төлөм"),
      firstDueDate: day,
      intervalMonths: z.coerce.number().int().min(1).max(12).default(1),
    })
    .optional()
    .nullable(),
});

export const createDebtSchema = debtScheduleSchema.extend({
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
export type DebtScheduleInput = z.infer<typeof debtScheduleSchema>;
