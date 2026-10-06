import "./config/timezone";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env, isProduction } from "./config/env";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { detectLanguage } from "./middleware/language";
import { translate } from "./i18n/messages";
import { ApiError } from "./utils/ApiError";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
// Before cors() so req.lang is set even when a request gets rejected by the
// origin check below (its error still needs a translated message).
app.use(detectLanguage);
// credentials: true + a checked allow-list (never "*") — required so the
// httpOnly refresh-token cookie is accepted cross-origin (Vercel frontend
// calling a Railway/Render backend, or localhost during dev).
app.use(
  cors({
    origin(origin, callback) {
      // No Origin header (curl, server-to-server, same-origin) — allow.
      if (!origin || env.clientUrls.includes(origin)) {
        callback(null, true);
      } else {
        callback(ApiError.forbidden(`CORS: ${origin} уруксат берилген тизмеде жок.`));
      }
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.use(morgan(isProduction ? "combined" : "dev"));

// Tight limit on credential-guessing endpoints specifically.
const authBruteForceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: (req: express.Request) => ({
    message: translate("Аракеттер өтө көп болду. Бир аз күтүп, кайра аракет кылыңыз.", req.lang),
  }),
});
app.use(
  ["/api/auth/login", "/api/auth/register", "/api/auth/google", "/api/auth/change-password", "/api/auth/forgot-password", "/api/auth/reset-password"],
  authBruteForceLimiter,
);

// Looser limit across the whole API — defense-in-depth without getting in the
// way of a busy cashier terminal hammering /sales and /products all day.
app.use(
  "/api",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 1200, standardHeaders: true, legacyHeaders: false }),
);

app.get("/health", (_req, res) => res.json({ status: "ok", service: "Ainabi Business API" }));

app.use("/api", routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
