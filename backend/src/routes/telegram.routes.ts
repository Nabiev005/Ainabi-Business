import { Router } from "express";
import { timingSafeEqual } from "crypto";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";
import { ensureWebhook, telegramEnabled } from "../utils/telegram";
import * as telegram from "../services/telegram.service";

const router = Router();

const sameSecret = (given: string | undefined, expected: string) =>
  !!given && !!expected && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

/** Telegram calls this for every message to the bot; it signs requests with our secret token. */
router.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    if (!telegramEnabled() || !sameSecret(req.header("x-telegram-bot-api-secret-token"), env.telegram.webhookSecret)) {
      throw ApiError.unauthorized();
    }
    // Answer Telegram right away; a slow AI answer shouldn't make it retry.
    await telegram.handleUpdate(req.body).catch((error) => console.error("Telegram update failed:", error));
    res.json({ ok: true });
  }),
);

/** Vercel Cron, once a day (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>". */
router.get(
  "/cron/daily",
  asyncHandler(async (req, res) => {
    if (!env.telegram.cronSecret || !sameSecret(req.header("authorization"), `Bearer ${env.telegram.cronSecret}`)) throw ApiError.unauthorized();
    res.json(await telegram.sendDailyReports());
  }),
);

// ---- the signed-in person's own link ----
router.get(
  "/link",
  requireAuth,
  asyncHandler(async (req, res) => {
    await ensureWebhook().catch((error) => console.error("Telegram setWebhook failed:", error));
    res.json(await telegram.linkStatus(req.auth!.employeeId));
  }),
);
router.post(
  "/link",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!telegramEnabled()) throw new ApiError(503, "Telegram бул серверде жандырылган эмес.");
    await ensureWebhook();
    res.json(await telegram.createLink(req.auth!.employeeId, req.lang));
  }),
);
router.delete(
  "/link",
  requireAuth,
  asyncHandler(async (req, res) => {
    await telegram.unlink(req.auth!.employeeId);
    res.status(204).send();
  }),
);

export default router;
