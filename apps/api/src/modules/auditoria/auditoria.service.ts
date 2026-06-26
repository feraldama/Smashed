import { prisma } from '../../lib/prisma.js';

import type { ListarAuditoriaQuery } from './auditoria.schemas.js';
import type { Prisma } from '@prisma/client';

/**
 * Visor de auditoría: lee el `AuditLog` ya poblado por el resto del sistema
 * (login, CRUD, descuentos, caja, permisos, etc.). Solo lectura, filtrable y
 * paginado. Siempre acotado a la empresa del usuario (tenant).
 */

interface Ctx {
  empresaId: string;
}

export async function listarAuditoria(ctx: Ctx, q: ListarAuditoriaQuery) {
  const where: Prisma.AuditLogWhereInput = {
    empresaId: ctx.empresaId,
    ...(q.accion ? { accion: q.accion } : {}),
    ...(q.usuarioId ? { usuarioId: q.usuarioId } : {}),
    ...(q.entidad ? { entidad: q.entidad } : {}),
    ...(q.desde || q.hasta
      ? {
          createdAt: {
            ...(q.desde ? { gte: q.desde } : {}),
            ...(q.hasta ? { lte: q.hasta } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      take: q.pageSize,
      skip: (q.page - 1) * q.pageSize,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        accion: true,
        entidad: true,
        entidadId: true,
        ip: true,
        metadata: true,
        diff: true,
        createdAt: true,
        usuario: { select: { id: true, nombreCompleto: true, email: true } },
        sucursal: { select: { id: true, nombre: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total, page: q.page, pageSize: q.pageSize };
}
