import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { hasPermission, Permission } from "../config/permissions";

/**
 * Restricts a route to roles holding the permission (see config/permissions.ts).
 * Must run after `requireAuth`.
 * Usage: router.post("/", requirePermission("products.manage"), controller)
 */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      throw ApiError.unauthorized();
    }
    if (!hasPermission(req.auth.role, permission)) {
      throw ApiError.forbidden();
    }
    next();
  };
}
