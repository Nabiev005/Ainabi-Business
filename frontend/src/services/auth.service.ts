import { api } from "./api";
import type { AuthResponse, Session } from "../types";

export interface RegisterPayload {
  name: string;
  businessName: string;
  phone: string;
  email: string;
  password: string;
  businessType?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/register", payload);
  return data;
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/login", payload);
  return data;
}

/** `idToken` is the Google Identity Services credential (a signed JWT), verified server-side. */
export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/google", { idToken });
  return data;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function refresh(): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/refresh");
  return data;
}

export async function changePassword(payload: { currentPassword?: string; newPassword: string }): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/change-password", payload);
  return data;
}

export async function fetchSession(): Promise<Session> {
  const { data } = await api.get<Session>("/auth/me");
  return data;
}

/** Whether the server can email reset links (otherwise the page shows the manual ways). */
export async function getPasswordResetStatus(): Promise<{ emailEnabled: boolean }> {
  const { data } = await api.get<{ emailEnabled: boolean }>("/auth/password-reset");
  return data;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post("/auth/forgot-password", { email });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api.post("/auth/reset-password", { token, newPassword });
}
