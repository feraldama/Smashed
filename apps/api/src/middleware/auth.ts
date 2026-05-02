
import { Errors } from '../lib/errors.js';
import { type AccessTokenPayload, verifyAccessToken } from '../lib/jwt.js';

import type { Rol } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';

/**
 * Verifica el access token (Authorization: Bearer ...) y popula req.context.
 */
export function authRequired(req: Request, _res: Response, next: NextFunction) {
  const auth = req.header('authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw Errors.unauthorized('Falta header Authorization Bearer');
  }
  const token = auth.slice(7).trim();
  if (!token) throw Errors.unauthorized();

  const payload: AccessTokenPayload = verifyAccessToken(token);

  req.context = {
    userId: payload.sub,
    empresaId: payload.empresaId,
    rol: payload.rol,
    sucursalActivaId: payload.sucursalActivaId,
    isSuperAdmin: payload.rol === 'SUPER_ADMIN',
  };
  next();
}

/**
 * Restringe el acceso a usuarios con uno de los roles dados.
 * Si tiene SUPER_ADMIN siempre pasa.
 */
export function requireRol(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.context) throw Errors.unauthorized();
    if (req.context.isSuperAdmin) return next();
    if (!roles.includes(req.context.rol)) {
      throw Errors.forbidden(`Requiere rol: ${roles.join(' | ')}`);
    }
    next();
  };
}
