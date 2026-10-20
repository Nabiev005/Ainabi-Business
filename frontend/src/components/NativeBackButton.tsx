import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { homePathFor } from "../hooks/usePermissions";
import { isNativeApp, runBackHandler } from "../utils/native";

/** Pages where "back" leaves the app (like any Android app's start screen). */
const EXIT_PATHS = ["/", "/login", "/register"];

/**
 * Android back button inside the app: close the open overlay, otherwise go
 * back a page, and on the role's start screen send the app to the background.
 * Without this Capacitor does nothing on the start screen and the button
 * feels broken.
 */
export function NativeBackButton() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { session } = useAuth();
  const home = session ? homePathFor(session) : "/login";
  const stateRef = useRef({ pathname, home });
  stateRef.current = { pathname, home };

  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    let remove: (() => void) | undefined;

    import("@capacitor/app").then(async ({ App }) => {
      const handle = await App.addListener("backButton", ({ canGoBack }) => {
        if (runBackHandler()) return;
        const { pathname: current, home: start } = stateRef.current;
        if (current === start || EXIT_PATHS.includes(current)) {
          App.minimizeApp();
        } else if (canGoBack) {
          navigate(-1);
        } else {
          navigate(start, { replace: true });
        }
      });
      if (cancelled) handle.remove();
      else remove = () => handle.remove();
    });

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [navigate]);

  return null;
}
