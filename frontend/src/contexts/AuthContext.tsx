import { createContext, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Business, Session } from "../types";
import * as authService from "../services/auth.service";
import { AUTH_LOGOUT_EVENT, tokenStore } from "../services/tokenStore";

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (payload: authService.RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  /** Sets a new password; the server signs out every other session. */
  changePassword: (payload: { currentPassword?: string; newPassword: string }) => Promise<void>;
  /** Patches session.business in place — e.g. right after Settings saves an
   * update, so other pages (POS's QR payment screen) see it without
   * waiting for the next token refresh. */
  updateSessionBusiness: (business: Business) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const bootstrapped = useRef(false);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setSession(null);
  }, []);

  useEffect(() => {
    // No token lives in localStorage, so every page load starts by asking
    // the httpOnly refresh cookie (if any) for a fresh access token.
    // Guarded against React StrictMode's double-invoke in dev, which would
    // otherwise fire two concurrent /refresh calls for the same cookie.
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    async function bootstrap() {
      try {
        const result = await authService.refresh();
        tokenStore.setAccessToken(result.accessToken);
        setSession(result.session);
      } catch {
        clearSession();
      } finally {
        setIsLoading(false);
      }
    }
    bootstrap();

    window.addEventListener(AUTH_LOGOUT_EVENT, clearSession);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, clearSession);
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authService.login({ email, password });
    tokenStore.setAccessToken(result.accessToken);
    setSession(result.session);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const result = await authService.loginWithGoogle(idToken);
    tokenStore.setAccessToken(result.accessToken);
    setSession(result.session);
  }, []);

  const register = useCallback(async (payload: authService.RegisterPayload) => {
    const result = await authService.register(payload);
    tokenStore.setAccessToken(result.accessToken);
    setSession(result.session);
  }, []);

  const changePassword = useCallback(async (payload: { currentPassword?: string; newPassword: string }) => {
    const result = await authService.changePassword(payload);
    tokenStore.setAccessToken(result.accessToken);
    setSession(result.session);
  }, []);

  const logout = useCallback(async () => {
    clearSession();
    authService.logout().catch(() => undefined);
  }, [clearSession]);

  const updateSessionBusiness = useCallback((business: Business) => {
    setSession((prev) => (prev ? { ...prev, business } : prev));
  }, []);

  const value = useMemo(
    () => ({ session, isLoading, login, loginWithGoogle, register, logout, changePassword, updateSessionBusiness }),
    [session, isLoading, login, loginWithGoogle, register, logout, changePassword, updateSessionBusiness],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
