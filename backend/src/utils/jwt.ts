import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import type { Role } from "../config/permissions";
import { env } from "../config/env";

export interface AccessTokenPayload {
  userId: string;
  businessId: string;
  employeeId: string;
  role: Role;
}

export interface RefreshTokenPayload {
  userId: string;
  jti: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  } as jwt.SignOptions);
}

export function signRefreshToken(payload: { userId: string }): string {
  // `jti` guarantees uniqueness even if two refresh tokens are minted for the
  // same user within the same second (e.g. concurrent requests) — without it
  // the resulting JWTs would be byte-identical and collide on tokenHash.
  return jwt.sign({ ...payload, jti: randomUUID() }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
}
