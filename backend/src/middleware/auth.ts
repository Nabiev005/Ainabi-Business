import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { AccessTokenPayload, verifyAccessToken } from "../utils/jwt";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
    }
  }
}

/**
 * Verifies the access token and attaches { userId, businessId, employeeId, role } to req.auth.
 *
 * The role and status are re-read from the database on every request rather
 * than trusted from the token: a deactivated/removed employee is locked out
 * immediately (not when their 15-minute token expires), and a role change
 * takes effect on the very next request.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(ApiError.unauthorized());
  }

  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(header.slice("Bearer ".length));
  } catch {
    return next(ApiError.unauthorized("Сессиянын мөөнөтү бүттү. Кайра кириңиз."));
  }

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: payload.employeeId },
      select: { businessId: true, userId: true, role: true, status: true },
    });
    if (!employee || employee.status !== "ACTIVE" || employee.businessId !== payload.businessId || employee.userId !== payload.userId) {
      return next(ApiError.unauthorized("Сиздин аккаунт өчүрүлгөн же бөгөттөлгөн."));
    }
    req.auth = { ...payload, role: employee.role };
    next();
  } catch (err) {
    next(err);
  }
}
