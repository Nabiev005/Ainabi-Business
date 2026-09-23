import { z } from "zod";

const optionalMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().nonnegative().nullable(),
);

export const repairStatusEnum = z.enum(["RECEIVED", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED"]);

export const createRepairSchema = z
  .object({
    customerId: z.string().optional().nullable(),
    customerName: z.string().trim().max(120).optional().nullable(),
    customerPhone: z.string().trim().max(40).optional().nullable(),
    device: z.string().trim().min(1, "Түзмөктү жазыңыз").max(160),
    serial: z.string().trim().max(64).optional().nullable(),
    problem: z.string().trim().min(1, "Көйгөйдү жазыңыз").max(1000),
    notes: z.string().trim().max(1000).optional().nullable(),
    estimatedPrice: optionalMoney.optional(),
    prepayment: z.coerce.number().nonnegative().default(0),
  })
  .refine((d) => !!d.customerId || !!d.customerName, { message: "Кардарды көрсөтүңүз", path: ["customerName"] });

export const updateRepairSchema = z.object({
  device: z.string().trim().min(1).max(160).optional(),
  serial: z.string().trim().max(64).optional().nullable(),
  problem: z.string().trim().min(1).max(1000).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  estimatedPrice: optionalMoney.optional(),
  finalPrice: optionalMoney.optional(),
  customerPhone: z.string().trim().max(40).optional().nullable(),
});

export const repairStatusSchema = z.object({
  status: repairStatusEnum,
  // Required when delivering.
  finalPrice: optionalMoney.optional(),
  paymentMethod: z.enum(["CASH", "CARD", "QR"]).optional(),
});

export const repairQuerySchema = z.object({
  status: repairStatusEnum.or(z.literal("ACTIVE")).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(30),
});

export type CreateRepairInput = z.infer<typeof createRepairSchema>;
export type UpdateRepairInput = z.infer<typeof updateRepairSchema>;
export type RepairStatusInput = z.infer<typeof repairStatusSchema>;
export type RepairQuery = z.infer<typeof repairQuerySchema>;
