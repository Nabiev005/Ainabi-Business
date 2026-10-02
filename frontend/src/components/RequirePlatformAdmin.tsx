import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { homePathFor } from "../hooks/usePermissions";

/** The platform panel exists only for PLATFORM_ADMIN_EMAILS accounts (the API checks it too). */
export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  if (!session?.isPlatformAdmin) return <Navigate to={homePathFor(session)} replace />;
  return <>{children}</>;
}
