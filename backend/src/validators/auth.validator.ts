import { z } from "zod";
import { LIMITS } from "./common";
import { businessTypeSchema } from "./settings.validator";

export const registerSchema = z.object({
  name: z.string().min(2, "Атыңызды толук жазыңыз").max(LIMITS.name),
  businessName: z.string().min(2, "Бизнес атын жазыңыз").max(LIMITS.name),
  phone: z.string().min(6, "Телефон номерин туура жазыңыз").max(LIMITS.phone),
  email: z.string().max(LIMITS.email).email("Email туура эмес"),
  password: z.string().min(8, "Пароль эң аз дегенде 8 белгиден турушу керек").max(LIMITS.password),
  businessType: businessTypeSchema.default("GENERAL"),
});

export const loginSchema = z.object({
  email: z.string().max(LIMITS.email).email("Email туура эмес"),
  password: z.string().min(1, "Пароль талап кылынат").max(LIMITS.password),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(10, "Google token жараксыз").max(5000),
});

export const changePasswordSchema = z.object({
  // Not needed for a Google-only account setting its first password.
  currentPassword: z.string().max(LIMITS.password).optional(),
  newPassword: z.string().min(8, "Пароль эң аз дегенде 8 белгиден турушу керек").max(200),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().max(LIMITS.email).email("Email туура эмес"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: z.string().min(8, "Пароль эң аз дегенде 8 белгиден турушу керек").max(200),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
