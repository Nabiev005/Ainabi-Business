import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError } from "../utils/ApiError";
import { isProduction } from "../config/env";
import { translate } from "../i18n/messages";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    message: translate(`Route ${req.method} ${req.originalUrl} табылган жок.`, req.lang),
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: translate("Киргизилген маалыматта ката бар.", req.lang),
      errors: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: translate(issue.message, req.lang),
      })),
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      message: translate(err.message, req.lang),
      details: err.details,
    });
  }

  // Database constraint errors are the user's to fix, not a server fault.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({ message: translate("Мындай жазуу мурунтан бар.", req.lang) });
    }
    if (err.code === "P2003" || err.code === "P2014") {
      return res.status(409).json({
        message: translate("Бул жазуу башка маалыматтарда колдонулат, ошондуктан өчүрүүгө болбойт.", req.lang),
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ message: translate("Табылган жок.", req.lang) });
    }
  }

  console.error(err);
  return res.status(500).json({
    message: translate("Сервер тарабынан ката кетти. Кайра аракет кылыңыз.", req.lang),
    stack: isProduction ? undefined : (err as Error)?.stack,
  });
}
