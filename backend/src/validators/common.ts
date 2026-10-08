import { z } from "zod";

/**
 * Shared field limits. Every free-text field gets a ceiling so nobody can
 * park megabytes in a "comment" (the body limit alone is 5 MB per request).
 */
export const LIMITS = {
  name: 200,
  short: 64,
  phone: 40,
  email: 254,
  password: 200,
  comment: 1000,
  text: 5000,
} as const;

/** Product photo: an http(s) link, or the small JPEG the product form makes (~100 KB). */
export const imageUrlSchema = z
  .string()
  .max(1_500_000, "Сүрөт өтө чоң")
  .refine(
    (v) => v === "" || /^https?:\/\/\S+$/i.test(v) || /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v),
    "Сүрөттүн дареги туура эмес",
  )
  .optional()
  .nullable();
