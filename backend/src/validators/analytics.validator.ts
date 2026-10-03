import { z } from "zod";

export const monthlyPlanSchema = z.object({
  // null (or 0) clears the plan.
  monthlyRevenuePlan: z.coerce
    .number()
    .min(0, "План терс сан болбошу керек")
    .max(999_999_999_999, "План өтө чоң")
    .nullable()
    .transform((v) => (v ? Math.round(v * 100) / 100 : null)),
});
