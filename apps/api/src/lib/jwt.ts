import { createHash, randomBytes } from 'node:crypto';

import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';

import { env } from '../config/env.js';

import { Errors } from './errors.js';

import type { Rol } from '@prisma/client';

/**
 * JWT con dos tipos de token, ambos firmados con el mismo JWT_SECRET y
 * distinguidos por el campo `type` en el payload.
 *
 *  - access  (15m por default) — Authorization: Bearer <token>
 *  - refresh (7d por default)  — httpOnly cookie, rotado en cada uso
 *
 * El refresh se hashea (sha256) antes de guardarse en BD: nunca persiste raw.
 */

export interface AccessTokenPayload extends JwtPayload {
  sub: string; // userId
  empresaId: string | null;
  rol: Rol;
  sucursalActivaId: string | null;
  type: 'access';
}

export interface RefreshTokenPayload extends JwtPayload {
  sub: string; // userId
  jti: string; // random — usado como tokenHash para detectar reuse
  type: 'refresh';
}

export function signAccessToken(args: {
  userId: string;
  empresaId: string | null;
  rol: Rol;
  sucursalActivaId: string | null;
}): string {
  const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
    sub: args.userId,
    empresaId: args.empresaId,
    rol: args.rol,
    sucursalActivaId: args.sucursalActivaId,
    type: 'access',
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
}

export function signRefreshToken(userId: string): {
  token: string;
  tokenHash: string;
  jti: string;
} {
  const jti = randomBytes(32).toString('hex');
  const payload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
    sub: userId,
    jti,
    type: 'refresh',
  };
  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  } as SignOptions);
  const tokenHash = hashToken(token);
  return { token, tokenHash, jti };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'string' || decoded.type !== 'access') {
      throw Errors.tokenInvalid();
    }
    return decoded as AccessTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw Errors.tokenExpired();
    if (err instanceof jwt.JsonWebTokenError) throw Errors.tokenInvalid();
    throw err;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === 'string' || decoded.type !== 'refresh') {
      throw Errors.tokenInvalid();
    }
    return decoded as RefreshTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw Errors.tokenExpired();
    if (err instanceof jwt.JsonWebTokenError) throw Errors.tokenInvalid();
    throw err;
  }
}

/**
 * Convierte una duración tipo "7d" / "15m" / "30s" a milisegundos.
 * Útil para configurar `Max-Age` de la cookie del refresh token.
 */
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Duración inválida: ${duration}`);
  const [, n, unit] = match;
  const value = Number.parseInt(n!, 10);
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unidad de duración desconocida: ${unit}`);
  }
}
