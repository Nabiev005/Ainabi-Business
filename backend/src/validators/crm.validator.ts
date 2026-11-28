import { z } from "zod";
import { LIMITS } from "./common";

export const CRM_SEGMENTS = ["lapsed", "top", "newcomers", "birthdays", "tag", "all"] as const;
export type CrmSegment = (typeof CRM_SEGMENTS)[number];

export const segmentQuerySchema = z.object({
  segment: z.enum(CRM_SEGMENTS).default("all"),
  /** "Hasn't bought for N days" (lapsed). */
  days: z.coerce.number().int().min(7).max(365).default(30),
  tag: z.string().trim().max(30).optional(),
  search: z.string().trim().max(100).optional(),
});
export type SegmentQuery = z.infer<typeof segmentQuerySchema>;

// Blank tags are dropped and duplicates merged by normalizeTags (crm.service).
const tagSchema = z.string().trim().max(30, "Тег 30 белгиден ашпасын");

export const crmProfileSchema = z.object({
  tags: z.array(tagSchema).max(20).default([]),
  /** "YYYY-MM-DD" or null to clear. */
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Туулган күндү туура жазыңыз")
    .nullable()
    .optional(),
});
export type CrmProfileInput = z.infer<typeof crmProfileSchema>;

export const activitySchema = z
  .object({
    kind: z.enum(["NOTE", "CALL", "MESSAGE", "FOLLOW_UP"]),
    text: z.string().trim().min(1, "Текст жазыңыз").max(LIMITS.comment),
    /** Only for FOLLOW_UP: when to get back to the customer. */
    dueAt: z.coerce.date().optional().nullable(),
  })
  .refine((a) => a.kind !== "FOLLOW_UP" || !!a.dueAt, { message: "Качан кайрылуу керектигин тандаңыз", path: ["dueAt"] });
export type ActivityInput = z.infer<typeof activitySchema>;

export const followUpQuerySchema = z.object({
  /** "due": today and overdue; "upcoming": everything open. */
  when: z.enum(["due", "upcoming"]).default("due"),
});
