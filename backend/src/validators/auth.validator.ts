import { z } from "zod";
import { businessTypeSchema } from "./settings.validator";

export const registerSchema = z.object({
  name: z.string().min(2, "Атыңызды толук жазыңыз"),
  businessName: z.string().min(2, "Бизнес атын жазыңыз"),
  phone: z.string().min(6, "Телефон номерин туура жазыңыз"),
  email: z.string().email("Email туура эмес"),
  password: z.string().min(6, "Пароль эң аз дегенде 6 белгиден турушу керек"),
  businessType: businessTypeSchema.default("GENERAL"),
});

export const loginSchema = z.object({
  email: z.string().email("Email туура эмес"),
  password: z.string().min(1, "Пароль талап кылынат"),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(10, "Google token жараксыз"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
