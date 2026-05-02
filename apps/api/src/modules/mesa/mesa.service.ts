import { type EstadoMesa, EstadoPedido } from '@prisma/client';

import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type {
  ActualizarMesaInput,
  ActualizarZonaInput,
  CrearMesaInput,
  CrearZonaInput,
} from './mesa.schemas.js';

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
      sucursalId: z.sucursalId,
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

// ═════════════════════════════════════════════════════════════════════════
//  CRUD ZONAS
// ═════════════════════════════════════════════════════════════════════════

async function assertSucursalEnEmpresa(user: UserCtx, sucursalId: string) {
  if (!user.empresaId) throw Errors.unauthorized();
  const suc = await prisma.sucursal.findUnique({
    where: { id: sucursalId },
    select: { empresaId: true },
  });
  if (!suc) throw Errors.notFound('Sucursal no encontrada');
  if (!user.isSuperAdmin && suc.empresaId !== user.empresaId) throw Errors.tenantMismatch();
}

async function getZonaOwned(user: UserCtx, zonaId: string) {
  if (!user.empresaId) throw Errors.unauthorized();
  const zona = await prisma.zonaMesa.findUnique({
    where: { id: zonaId },
    include: { sucursal: { select: { empresaId: true } } },
  });
  if (!zona) throw Errors.notFound('Zona no encontrada');
  if (!user.isSuperAdmin && zona.sucursal.empresaId !== user.empresaId) {
    throw Errors.tenantMismatch();
  }
  return zona;
}

export async function crearZona(user: UserCtx, input: CrearZonaInput) {
  await assertSucursalEnEmpresa(user, input.sucursalId);

  const dup = await prisma.zonaMesa.findUnique({
    where: { sucursalId_nombre: { sucursalId: input.sucursalId, nombre: input.nombre } },
  });
  if (dup) throw Errors.conflict(`Ya existe una zona "${input.nombre}" en esa sucursal`);

  return prisma.zonaMesa.create({
    data: {
      sucursalId: input.sucursalId,
      nombre: input.nombre,
      orden: input.orden ?? 0,
    },
  });
}

export async function actualizarZona(user: UserCtx, zonaId: string, input: ActualizarZonaInput) {
  const zona = await getZonaOwned(user, zonaId);

  if (input.nombre && input.nombre !== zona.nombre) {
    const dup = await prisma.zonaMesa.findUnique({
      where: { sucursalId_nombre: { sucursalId: zona.sucursalId, nombre: input.nombre } },
    });
    if (dup) throw Errors.conflict(`Ya existe una zona "${input.nombre}" en esa sucursal`);
  }

  return prisma.zonaMesa.update({ where: { id: zonaId }, data: input });
}

export async function eliminarZona(user: UserCtx, zonaId: string) {
  const zona = await getZonaOwned(user, zonaId);
  const cantMesas = await prisma.mesa.count({ where: { zonaMesaId: zona.id } });
  if (cantMesas > 0) {
    throw Errors.conflict(
      `No se puede eliminar la zona — tiene ${cantMesas} mesa(s). Eliminá las mesas primero.`,
    );
  }
  await prisma.zonaMesa.delete({ where: { id: zonaId } });
}

// ═════════════════════════════════════════════════════════════════════════
//  CRUD MESAS
// ═════════════════════════════════════════════════════════════════════════

async function getMesaOwned(user: UserCtx, mesaId: string) {
  if (!user.empresaId) throw Errors.unauthorized();
  const mesa = await prisma.mesa.findUnique({
    where: { id: mesaId },
    include: { zona: { select: { sucursalId: true, sucursal: { select: { empresaId: true } } } } },
  });
  if (!mesa) throw Errors.notFound('Mesa no encontrada');
  if (!user.isSuperAdmin && mesa.zona.sucursal.empresaId !== user.empresaId) {
    throw Errors.tenantMismatch();
  }
  return mesa;
}

export async function crearMesa(user: UserCtx, input: CrearMesaInput) {
  // Verifica que la zona pertenezca al tenant
  await getZonaOwned(user, input.zonaMesaId);

  const dup = await prisma.mesa.findUnique({
    where: { zonaMesaId_numero: { zonaMesaId: input.zonaMesaId, numero: input.numero } },
  });
  if (dup) throw Errors.conflict(`Ya existe una mesa #${input.numero} en esa zona`);

  return prisma.mesa.create({
    data: {
      zonaMesaId: input.zonaMesaId,
      numero: input.numero,
      capacidad: input.capacidad ?? 4,
    },
  });
}

export async function actualizarMesa(user: UserCtx, mesaId: string, input: ActualizarMesaInput) {
  const mesa = await getMesaOwned(user, mesaId);

  // Si cambia de zona, validar que pertenezca al tenant y a la misma sucursal
  if (input.zonaMesaId && input.zonaMesaId !== mesa.zonaMesaId) {
    const nueva = await getZonaOwned(user, input.zonaMesaId);
    if (nueva.sucursalId !== mesa.zona.sucursalId) {
      throw Errors.conflict('No se puede mover una mesa a una zona de otra sucursal');
    }
  }

  const targetZonaId = input.zonaMesaId ?? mesa.zonaMesaId;
  const targetNumero = input.numero ?? mesa.numero;
  if (targetZonaId !== mesa.zonaMesaId || targetNumero !== mesa.numero) {
    const dup = await prisma.mesa.findUnique({
      where: { zonaMesaId_numero: { zonaMesaId: targetZonaId, numero: targetNumero } },
    });
    if (dup && dup.id !== mesaId) {
      throw Errors.conflict(`Ya existe una mesa #${targetNumero} en esa zona`);
    }
  }

  return prisma.mesa.update({ where: { id: mesaId }, data: input });
}

export async function eliminarMesa(user: UserCtx, mesaId: string) {
  await getMesaOwned(user, mesaId);

  const pedidoActivo = await prisma.pedido.findFirst({
    where: {
      mesaId,
      estado: { notIn: [EstadoPedido.FACTURADO, EstadoPedido.CANCELADO, EstadoPedido.ENTREGADO] },
      deletedAt: null,
    },
    select: { id: true, numero: true },
  });
  if (pedidoActivo) {
    throw Errors.conflict(
      `No se puede eliminar — la mesa tiene un pedido activo (#${pedidoActivo.numero}). Cerralo primero.`,
    );
  }

  await prisma.mesa.delete({ where: { id: mesaId } });
}
