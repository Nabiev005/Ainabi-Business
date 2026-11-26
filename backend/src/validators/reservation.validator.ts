import { z } from "zod";
import { LIMITS } from "./common";

export const createReservationSchema = z.object({
  customerId: z.string().optional().nullable(),
  customerName: z.string().trim().max(LIMITS.name).optional().nullable(),
  phone: z.string().trim().max(LIMITS.phone).optional().nullable(),
  locationId: z.string().optional().nullable(),
  note: z.string().trim().max(LIMITS.comment).optional().nullable(),
  // 0 = held until someone sells or cancels it.
  expiresInDays: z.coerce.number().int().min(0).max(30).default(3),
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.coerce.number().positive("Саны 0дон чоң болушу керек").max(100_000) }))
    .min(1, "Кеминде бир товар тандаңыз")
    .max(100),
});

export const reservationQuerySchema = z.object({
  status: z.enum(["ACTIVE", "ALL"]).default("ACTIVE"),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
