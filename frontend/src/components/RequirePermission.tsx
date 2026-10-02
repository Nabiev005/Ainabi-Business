import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "../hooks/usePermissions";
import type { Permission } from "../types";

/** Renders the page only for roles holding the permission (any of them, when
 * a list is given); everyone else is sent to their own home screen (the
 * backend refuses the data anyway). */
export function RequirePermission({ permission, children }: { permission: Permission | Permission[]; children: ReactNode }) {
  const { can, homePath } = usePermissions();
  const allowed = Array.isArray(permission) ? permission.some(can) : can(permission);
  if (!allowed) return <Navigate to={homePath} replace />;
  return <>{children}</>;
}
