import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { businessRateLimit } from "../middleware/businessRateLimit";
import { requirePermission } from "../middleware/requireRole";
import { requireFeature } from "../middleware/subscription";
import { asyncHandler } from "../utils/asyncHandler";
import * as assistantService from "../services/assistant.service";

const router = Router();

const chatSchema = z.object({
  // The conversation so far, oldest first, ending with the new question.
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(20)
    .refine((m) => m[0].role === "user" && m[m.length - 1].role === "user", "Суроо туура эмес"),
});

router.use(requireAuth, businessRateLimit, requireFeature("analytics"), requirePermission("assistant.use"));

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(assistantService.assistantStatus());
  }),
);

router.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const { messages } = chatSchema.parse(req.body);
    res.json(await assistantService.ask(req.auth!.businessId, messages, req.lang));
  }),
);

export default router;
