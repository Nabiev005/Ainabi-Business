import { z } from "zod";

export const taskStatusEnum = z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]);
export const taskPriorityEnum = z.enum(["LOW", "NORMAL", "HIGH"]);

const optionalDate = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата туура эмес").nullable(),
);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Тапшырманы жазыңыз").max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  assigneeId: z.string().min(1, "Кызматкерди тандаңыз"),
  priority: taskPriorityEnum.default("NORMAL"),
  dueDate: optionalDate.optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const taskStatusSchema = z.object({ status: taskStatusEnum });

export const taskQuerySchema = z.object({
  // "mine" = assigned to me; "all" = the whole team (tasks.manage only).
  scope: z.enum(["mine", "all"]).default("mine"),
  status: taskStatusEnum.or(z.literal("OPEN")).optional(),
  assigneeId: z.string().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskQuery = z.infer<typeof taskQuerySchema>;
