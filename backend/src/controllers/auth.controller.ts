import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { clearRefreshCookie, setRefreshCookie } from "../utils/cookies";
import { env } from "../config/env";
import { googleAuthSchema, loginSchema, registerSchema } from "../validators/auth.validator";
import * as authService from "../services/auth.service";

export const registerHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);
  const { accessToken, refreshToken, session } = await authService.register(input, req.lang);
  setRefreshCookie(res, refreshToken);
  res.status(201).json({ accessToken, session });
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const { accessToken, refreshToken, session } = await authService.login(input);
  setRefreshCookie(res, refreshToken);
  res.status(200).json({ accessToken, session });
});

export const googleHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = googleAuthSchema.parse(req.body);
  const { accessToken, refreshToken, session } = await authService.loginWithGoogle(input, req.lang);
  setRefreshCookie(res, refreshToken);
  res.status(200).json({ accessToken, session });
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[env.refreshCookieName];
  if (!refreshToken) {
    throw ApiError.unauthorized("Сессия табылган жок. Кайра кириңиз.");
  }
  const result = await authService.refresh(refreshToken);
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({ accessToken: result.accessToken, session: result.session });
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[env.refreshCookieName];
  if (refreshToken) {
    await authService.logout(refreshToken);
  }
  clearRefreshCookie(res);
  res.status(204).send();
});

export const meHandler = asyncHandler(async (req: Request, res: Response) => {
  const session = await authService.getSession(req.auth!.userId, req.auth!.businessId);
  res.status(200).json(session);
});
