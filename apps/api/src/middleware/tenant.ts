
import { Errors } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

import type { NextFunction, Request, Response } from 'express';

/**
 * Middleware para endpoints que necesitan una sucursal activa.
 * Falla si el usuario no tiene `sucursalActivaId` en su token y no es SUPER_ADMIN.
 *
 * Uso típico: rutas operativas (POS, KDS, comprobantes, caja).
 * Las rutas de gestión (admin) usan `authRequired` solo.
 */
export function requireSucursalActiva(req: Request, _res: Response, next: NextFunction) {
  if (!req.context) throw Errors.unauthorized();
  if (req.context.isSuperAdmin) return next();

  if (!req.context.sucursalActivaId) {
    throw Errors.forbidden('Debes seleccionar una sucursal activa antes de continuar');
  }
  next();
}

/**
 * Verifica que el usuario tenga acceso a la sucursal `sucursalId` (vía UsuarioSucursal).
 * SUPER_ADMIN siempre pasa.
 */
export async function assertAccesoSucursal(
  userId: string,
  sucursalId: string,
  isSuperAdmin: boolean,
) {
  if (isSuperAdmin) return;
  const link = await prisma.usuarioSucursal.findUnique({
    where: { usuarioId_sucursalId: { usuarioId: userId, sucursalId } },
  });
  if (!link) throw Errors.sucursalNoAutorizada();
}

/**
 * Verifica que la sucursal pertenezca a la empresa del usuario actual.
 */
export async function assertSucursalDeEmpresa(empresaId: string | null, sucursalId: string) {
  if (!empresaId) return; // super admin
  const sucursal = await prisma.sucursal.findUnique({
    where: { id: sucursalId },
    select: { empresaId: true },
  });
  if (!sucursal || sucursal.empresaId !== empresaId) {
    throw Errors.tenantMismatch();
  }
}
