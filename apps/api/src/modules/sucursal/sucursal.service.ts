import { type Prisma, type Rol } from '@prisma/client';

import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type { ActualizarSucursalInput, CrearSucursalInput } from './sucursal.schemas.js';

interface UserCtx {
  userId: string;
  empresaId: string | null;
  rol: Rol;
  isSuperAdmin: boolean;
}

const ROLES_GESTION: Rol[] = ['ADMIN_EMPRESA', 'SUPER_ADMIN'];

const SELECT_SUCURSAL = {
  id: true,
  empresaId: true,
  nombre: true,
  codigo: true,
  establecimiento: true,
  direccion: true,
  ciudad: true,
  departamento: true,
  telefono: true,
  email: true,
  zonaHoraria: true,
  activa: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      cajas: { where: { activa: true } },
      puntosExpedicion: { where: { activo: true } },
    },
  },
} satisfies Prisma.SucursalSelect;

// ───────────────────────────────────────────────────────────────────────────
//  LIST
// ───────────────────────────────────────────────────────────────────────────

export async function listarSucursales(user: UserCtx) {
  if (!user.empresaId && !user.isSuperAdmin) {
    throw Errors.forbidden('Sin empresa asignada');
  }

  const sucursales = await prisma.sucursal.findMany({
    where: {
      deletedAt: null,
      ...(user.isSuperAdmin && !user.empresaId
        ? {}
        : user.empresaId
          ? { empresaId: user.empresaId }
          : {}),
    },
    select: SELECT_SUCURSAL,
    orderBy: [{ activa: 'desc' }, { nombre: 'asc' }],
  });

  return { sucursales };
}

// ───────────────────────────────────────────────────────────────────────────
//  GET BY ID
// ───────────────────────────────────────────────────────────────────────────

export async function obtenerSucursal(user: UserCtx, id: string) {
  const s = await prisma.sucursal.findUnique({ where: { id }, select: SELECT_SUCURSAL });
  if (!s || (s as { deletedAt?: Date | null }).deletedAt)
    throw Errors.notFound('Sucursal no encontrada');
  if (!user.isSuperAdmin && s.empresaId !== user.empresaId) throw Errors.tenantMismatch();
  return s;
}

// ───────────────────────────────────────────────────────────────────────────
//  CREAR
// ───────────────────────────────────────────────────────────────────────────

export async function crearSucursal(user: UserCtx, input: CrearSucursalInput) {
  if (!ROLES_GESTION.includes(user.rol)) throw Errors.forbidden();
  if (!user.empresaId) throw Errors.forbidden('Sin empresa asignada');
  const empresaId = user.empresaId;

  // Código y establecimiento únicos por empresa
  const ya = await prisma.sucursal.findFirst({
    where: {
      empresaId,
      deletedAt: null,
      OR: [{ codigo: input.codigo }, { establecimiento: input.establecimiento }],
    },
    select: { codigo: true, establecimiento: true },
  });
  if (ya) {
    throw Errors.conflict(
      ya.codigo === input.codigo
        ? `Ya existe una sucursal con código ${input.codigo}`
        : `Ya existe una sucursal con establecimiento ${input.establecimiento}`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const sucursal = await tx.sucursal.create({
      data: {
        empresaId,
        nombre: input.nombre,
        codigo: input.codigo,
        establecimiento: input.establecimiento,
        direccion: input.direccion,
        ciudad: input.ciudad,
        departamento: input.departamento,
        telefono: input.telefono,
        email: input.email,
        zonaHoraria: input.zonaHoraria,
      },
      select: SELECT_SUCURSAL,
    });

    await tx.auditLog.create({
      data: {
        empresaId: user.empresaId,
        usuarioId: user.userId,
        accion: 'CREAR',
        entidad: 'Sucursal',
        entidadId: sucursal.id,
        metadata: { codigo: sucursal.codigo, establecimiento: sucursal.establecimiento },
      },
    });

    return sucursal;
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  ACTUALIZAR
// ───────────────────────────────────────────────────────────────────────────

export async function actualizarSucursal(
  user: UserCtx,
  id: string,
  input: ActualizarSucursalInput,
) {
  if (!ROLES_GESTION.includes(user.rol)) throw Errors.forbidden();

  const target = await prisma.sucursal.findUnique({
    where: { id },
    select: { id: true, empresaId: true, codigo: true, establecimiento: true, deletedAt: true },
  });
  if (!target || target.deletedAt) throw Errors.notFound('Sucursal no encontrada');
  if (!user.isSuperAdmin && target.empresaId !== user.empresaId) throw Errors.tenantMismatch();

  // Verificar unicidad de codigo/establecimiento si cambian
  if (input.codigo && input.codigo !== target.codigo) {
    const ya = await prisma.sucursal.findFirst({
      where: {
        empresaId: target.empresaId,
        deletedAt: null,
        codigo: input.codigo,
        id: { not: id },
      },
      select: { id: true },
    });
    if (ya) throw Errors.conflict(`Ya existe una sucursal con código ${input.codigo}`);
  }
  if (input.establecimiento && input.establecimiento !== target.establecimiento) {
    const ya = await prisma.sucursal.findFirst({
      where: {
        empresaId: target.empresaId,
        deletedAt: null,
        establecimiento: input.establecimiento,
        id: { not: id },
      },
      select: { id: true },
    });
    if (ya) {
      throw Errors.conflict(`Ya existe una sucursal con establecimiento ${input.establecimiento}`);
    }
  }

  const data: Prisma.SucursalUpdateInput = {};
  if (input.nombre !== undefined) data.nombre = input.nombre;
  if (input.codigo !== undefined) data.codigo = input.codigo;
  if (input.establecimiento !== undefined) data.establecimiento = input.establecimiento;
  if (input.direccion !== undefined) data.direccion = input.direccion;
  if (input.ciudad !== undefined) data.ciudad = input.ciudad;
  if (input.departamento !== undefined) data.departamento = input.departamento;
  if (input.telefono !== undefined) data.telefono = input.telefono;
  if (input.email !== undefined) data.email = input.email;
  if (input.zonaHoraria !== undefined) data.zonaHoraria = input.zonaHoraria;
  if (input.activa !== undefined) data.activa = input.activa;

  const sucursal = await prisma.sucursal.update({
    where: { id },
    data,
    select: SELECT_SUCURSAL,
  });

  await prisma.auditLog.create({
    data: {
      empresaId: user.empresaId,
      usuarioId: user.userId,
      accion: 'ACTUALIZAR',
      entidad: 'Sucursal',
      entidadId: id,
      metadata: { campos: Object.keys(input) },
    },
  });

  return sucursal;
}

// ───────────────────────────────────────────────────────────────────────────
//  ELIMINAR (soft, con guards)
// ───────────────────────────────────────────────────────────────────────────

export async function eliminarSucursal(user: UserCtx, id: string) {
  if (!ROLES_GESTION.includes(user.rol)) throw Errors.forbidden();

  const target = await prisma.sucursal.findUnique({
    where: { id },
    select: {
      id: true,
      empresaId: true,
      deletedAt: true,
      _count: {
        select: {
          cajas: { where: { activa: true } },
          comprobantes: true,
          pedidos: { where: { deletedAt: null } },
        },
      },
    },
  });
  if (!target || target.deletedAt) throw Errors.notFound('Sucursal no encontrada');
  if (!user.isSuperAdmin && target.empresaId !== user.empresaId) throw Errors.tenantMismatch();

  // No permitir eliminar si tiene comprobantes (historia fiscal)
  if (target._count.comprobantes > 0) {
    throw Errors.conflict(
      `Sucursal tiene ${target._count.comprobantes} comprobante(s). Solo se puede desactivar.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.sucursal.update({
      where: { id },
      data: { deletedAt: new Date(), activa: false },
    });
    await tx.auditLog.create({
      data: {
        empresaId: user.empresaId,
        usuarioId: user.userId,
        accion: 'ELIMINAR',
        entidad: 'Sucursal',
        entidadId: id,
      },
    });
  });

  return { ok: true };
}
