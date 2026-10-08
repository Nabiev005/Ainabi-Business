import { z } from "zod";
import { LIMITS } from "./common";
import { ASSIGNABLE_ROLES } from "../config/permissions";

export const inviteEmployeeSchema = z.object({
  name: z.string().min(2, "Атын жазыңыз").max(LIMITS.name),
  email: z.string().max(LIMITS.email).email("Email туура эмес"),
  phone: z.string().max(LIMITS.phone).optional().nullable(),
  password: z.string().min(8, "Пароль эң аз дегенде 8 белгиден турушу керек").max(LIMITS.password),
  role: z.enum(ASSIGNABLE_ROLES),
  locationId: z.string().optional().nullable(),
});

export const updateEmployeeSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  // null = back to the default location.
  locationId: z.string().optional().nullable(),
});

export const resetEmployeePasswordSchema = z.object({
  password: z.string().min(8, "Пароль эң аз дегенде 8 белгиден турушу керек").max(200),
});

export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
