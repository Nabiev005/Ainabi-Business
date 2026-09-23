import { z } from "zod";

export const inviteEmployeeSchema = z.object({
  name: z.string().min(2, "Атын жазыңыз"),
  email: z.string().email("Email туура эмес"),
  phone: z.string().optional().nullable(),
  password: z.string().min(6, "Пароль эң аз дегенде 6 белгиден турушу керек"),
  role: z.enum(["ADMIN", "CASHIER"]),
  locationId: z.string().optional().nullable(),
});

export const updateEmployeeSchema = z.object({
  role: z.enum(["ADMIN", "CASHIER"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  // null = back to the default location.
  locationId: z.string().optional().nullable(),
});

export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
