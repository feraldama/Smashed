import { isProd } from '../../config/env.js';
import { Errors } from '../../lib/errors.js';

import { loginSchema, refreshSchema, seleccionarSucursalSchema } from './auth.schemas.js';
import * as service from './auth.service.js';

import type { Request, Response } from 'express';

const REFRESH_COOKIE = 'smash_refresh';

function setRefreshCookie(res: Response, token: string, maxAgeMs: number) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    // path: '/' para que la cookie aplique a todos los paths (necesario cuando el frontend
    // pasa por un rewrite tipo /api/auth/* en Next).
    path: '/',
    maxAge: maxAgeMs,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/' });
}

function clientMeta(req: Request) {
  return {
    ip: req.ip,
    userAgent: req.header('user-agent') ?? undefined,
  };
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const result = await service.login(input, clientMeta(req));
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresInMs);
  res.json({
    accessToken: result.accessToken,
    user: result.user,
  });
}

export async function refresh(req: Request, res: Response) {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
  const refreshToken = cookies[REFRESH_COOKIE];
  if (!refreshToken) throw Errors.unauthorized('Sin refresh token');

  // Body opcional con hint de sucursal activa actual del cliente.
  const hint = refreshSchema.parse(req.body ?? {});
  const result = await service.refresh(refreshToken, clientMeta(req), hint);
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresInMs);
  res.json({ accessToken: result.accessToken, sucursalActivaId: result.sucursalActivaId });
}

export async function logout(req: Request, res: Response) {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies ?? {};
  await service.logout(cookies[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  res.json({ ok: true });
}

export async function me(req: Request, res: Response) {
  if (!req.context) throw Errors.unauthorized();
  const user = await service.me(req.context.userId);
  res.json({ user, sucursalActivaId: req.context.sucursalActivaId });
}

export async function seleccionarSucursal(req: Request, res: Response) {
  if (!req.context) throw Errors.unauthorized();
  const input = seleccionarSucursalSchema.parse(req.body);
  const result = await service.seleccionarSucursal({
    userId: req.context.userId,
    empresaId: req.context.empresaId,
    rol: req.context.rol, // ya tipado como Rol en req.context
    isSuperAdmin: req.context.isSuperAdmin,
    sucursalId: input.sucursalId,
  });
  res.json(result);
}
