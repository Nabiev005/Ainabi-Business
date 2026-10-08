import { z } from "zod";
import { LIMITS } from "./common";

export const customerSchema = z.object({
  name: z.string().min(1, "Кардардын атын жазыңыз").max(LIMITS.name),
  phone: z.string().max(LIMITS.phone).optional().nullable(),
  notes: z.string().max(LIMITS.text).optional().nullable(),
  isWholesale: z.boolean().default(false),
});

export type CustomerInput = z.infer<typeof customerSchema>;
