import { z } from "zod";

export const stageSchema = z.object({
  name: z.string().trim().min(1, "Этаптын атын жазыңыз").max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Түс туура эмес").default("#64748b"),
  blocksSale: z.boolean().default(false),
});

export const reorderStagesSchema = z.object({
  ids: z.array(z.string().min(1)).max(30),
});

export const moveProductsSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(200),
  // null = take the products out of the pipeline ("no stage").
  stageId: z.string().min(1).nullable(),
});

export const pipelineBoardQuerySchema = z.object({
  search: z.string().optional(),
});

export type StageInput = z.infer<typeof stageSchema>;
export type PipelineBoardQuery = z.infer<typeof pipelineBoardQuerySchema>;
