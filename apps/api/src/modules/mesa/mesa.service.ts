import { type EstadoMesa, EstadoPedido } from '@prisma/client';

import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

interface UserCtx {
  empresaId: string | null;
  sucursalActivaId: string | null;
  isSuperAdmin: boolean;
}

/**
 * Lista las mesas de la sucursal activa, agrupadas por zona, con estado actual
 * y el pedido activo si está OCUPADA.
 */
export async function listarMesas(user: UserCtx) {
  if (!user.empresaId) return { zonas: [] };
  if (!user.sucursalActivaId && !user.isSuperAdmin) {
    throw Errors.forbidden('Seleccioná una sucursal activa');
  }

  const where = user.sucursalActivaId
    ? { sucursalId: user.sucursalActivaId }
    : { sucursal: { empresaId: user.empresaId } };

  const zonas = await prisma.zonaMesa.findMany({
    where,
    orderBy: { orden: 'asc' },
    include: {
      mesas: {
        orderBy: { numero: 'asc' },
        include: {
          pedidos: {
            where: {
              estado: {
                notIn: [EstadoPedido.FACTURADO, EstadoPedido.CANCELADO, EstadoPedido.ENTREGADO],
              },
              deletedAt: null,
            },
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              numero: true,
              estado: true,
              total: true,
              tomadoEn: true,
              tomadoPor: { select: { id: true, nombreCompleto: true } },
            },
          },
        },
      },
    },
  });

  return {
    zonas: zonas.map((z) => ({
      id: z.id,
      nombre: z.nombre,
      orden: z.orden,
      mesas: z.mesas.map((m) => ({
        id: m.id,
        numero: m.numero,
        capacidad: m.capacidad,
        estado: m.estado,
        pedidoActivo: m.pedidos[0] ?? null,
      })),
    })),
  };
}

export async function cambiarEstadoMesa(user: UserCtx, mesaId: string, nuevo: EstadoMesa) {
  if (!user.empresaId) throw Errors.unauthorized();

  const mesa = await prisma.mesa.findUnique({
    where: { id: mesaId },
    include: { zona: { select: { sucursalId: true, sucursal: { select: { empresaId: true } } } } },
  });
  if (!mesa) throw Errors.notFound('Mesa no encontrada');
  if (!user.isSuperAdmin && mesa.zona.sucursal.empresaId !== user.empresaId) {
    throw Errors.tenantMismatch();
  }
  if (user.sucursalActivaId && mesa.zona.sucursalId !== user.sucursalActivaId) {
    throw Errors.sucursalNoAutorizada();
  }

  return prisma.mesa.update({ where: { id: mesaId }, data: { estado: nuevo } });
}
