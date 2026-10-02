import { useCallback } from "react";
import { useAuth } from "./useAuth";
import type { Permission, Session } from "../types";

export function sessionCan(session: Session | null, permission: Permission): boolean {
  return !!session?.permissions?.includes(permission);
}

/**
 * Where a role lands after login / when it opens a page it can't use:
 * the first screen it actually works in.
 */
export function homePathFor(session: Session | null): string {
  if (sessionCan(session, "reports.view")) return "/dashboard";
  if (sessionCan(session, "pos.sell")) return "/pos";
  if (sessionCan(session, "stock.receive")) return "/receiving";
  return "/products";
}

/** `can("products.manage")` — mirrors the backend's permission checks. */
export function usePermissions() {
  const { session } = useAuth();
  const can = useCallback((permission: Permission) => sessionCan(session, permission), [session]);
  return { can, homePath: homePathFor(session) };
}
