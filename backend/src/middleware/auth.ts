import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { AccessTokenPayload, verifyAccessToken } from "../utils/jwt";
import { isPlatformAdminUser } from "../config/env";
import { subscriptionInfo } from "../config/plans";
import "./subscription";

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
      select: {
        businessId: true,
        userId: true,
        role: true,
        status: true,
        user: { select: { mustChangePassword: true, email: true, googleId: true } },
        business: { select: { plan: true, planExpiresAt: true, isTrial: true } },
      },
    });
    if (!employee || employee.status !== "ACTIVE" || employee.businessId !== payload.businessId || employee.userId !== payload.userId) {
      return next(ApiError.unauthorized("Сиздин аккаунт өчүрүлгөн же бөгөттөлгөн."));
    }
    // Someone else chose this password (invite / owner reset): until the
    // person picks their own, only the /auth endpoints (me, change-password,
    // logout) are open.
    if (employee.user.mustChangePassword && !req.originalUrl.startsWith("/api/auth/")) {
      return next(new ApiError(403, "Адегенде өзүңүздүн паролуңузду коюңуз.", { code: "PASSWORD_CHANGE_REQUIRED" }));
    }
    req.auth = { ...payload, role: employee.role };
    req.isPlatformAdmin = isPlatformAdminUser(employee.user);
    req.subscription = subscriptionInfo(employee.business);

    // Subscription ran out: everything stays readable, nothing can change
    // until it's paid. Signing in/out, the billing page and the platform
    // panel keep working; the platform owner's own business is never locked.
    const isRead = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
    const exempt = ["/api/auth/", "/api/billing", "/api/platform/"].some((p) => req.originalUrl.startsWith(p));
    if (!req.subscription.active && !isRead && !exempt && !req.isPlatformAdmin) {
      return next(new ApiError(402, "Подпискаңыздын мөөнөтү бүттү. Маалымат сакталган — улантуу үчүн төлөңүз.", { code: "SUBSCRIPTION_EXPIRED" }));
    }
    next();
  } catch (err) {
    next(err);
  }
}
