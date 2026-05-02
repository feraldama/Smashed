import { type Prisma, type Rol } from '@prisma/client';

import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type { ActualizarConfiguracionInput, ActualizarEmpresaInput } from './empresa.schemas.js';

interface UserCtx {
  userId: string;
  empresaId: string | null;
  rol: Rol;
  isSuperAdmin: boolean;
}

const ROLES_GESTION: Rol[] = ['ADMIN_EMPRESA', 'SUPER_ADMIN'];

const SELECT_EMPRESA = {
  id: true,
  nombreFantasia: true,
  razonSocial: true,
  ruc: true,
  dv: true,
  direccion: true,
  telefono: true,
  email: true,
  logoUrl: true,
  colorPrimario: true,
  colorSecundario: true,
  zonaHoraria: true,
  activa: true,
  createdAt: true,
  updatedAt: true,
  configuracion: {
    select: {
      permitirStockNegativo: true,
      redondearTotales: true,
      ivaIncluidoEnPrecio: true,
      emitirTicketPorDefecto: true,
    },
  },
  _count: {
    select: {
      sucursales: { where: { deletedAt: null } },
      usuarios: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.EmpresaSelect;

// ───────────────────────────────────────────────────────────────────────────
//  GET — empresa actual del usuario
// ───────────────────────────────────────────────────────────────────────────

export async function obtenerEmpresa(user: UserCtx) {
  if (!user.empresaId) throw Errors.notFound('Sin empresa asignada');

  const empresa = await prisma.empresa.findUnique({
    where: { id: user.empresaId },
    select: SELECT_EMPRESA,
  });
  if (!empresa) throw Errors.notFound('Empresa no encontrada');

  // Si no tiene configuración, crear una con defaults
  if (!empresa.configuracion) {
    await prisma.configuracionEmpresa.create({
      data: { empresaId: user.empresaId },
    });
    return prisma.empresa.findUniqueOrThrow({
      where: { id: user.empresaId },
      select: SELECT_EMPRESA,
    });
  }

  return empresa;
}

// ───────────────────────────────────────────────────────────────────────────
//  ACTUALIZAR
// ───────────────────────────────────────────────────────────────────────────

export async function actualizarEmpresa(user: UserCtx, input: ActualizarEmpresaInput) {
  if (!ROLES_GESTION.includes(user.rol)) throw Errors.forbidden();
  if (!user.empresaId) throw Errors.forbidden('Sin empresa asignada');

  // Si cambia el RUC, validar unicidad global
  if (input.ruc) {
    const ya = await prisma.empresa.findFirst({
      where: { ruc: input.ruc, id: { not: user.empresaId }, deletedAt: null },
      select: { id: true },
    });
    if (ya) throw Errors.conflict('Ya existe otra empresa con ese RUC');
  }

  const data: Prisma.EmpresaUpdateInput = {};
  if (input.nombreFantasia !== undefined) data.nombreFantasia = input.nombreFantasia;
  if (input.razonSocial !== undefined) data.razonSocial = input.razonSocial;
  if (input.ruc !== undefined) data.ruc = input.ruc;
  if (input.dv !== undefined) data.dv = input.dv;
  if (input.direccion !== undefined) data.direccion = input.direccion;
  if (input.telefono !== undefined) data.telefono = input.telefono;
  if (input.email !== undefined) data.email = input.email;
  if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;
  if (input.colorPrimario !== undefined) data.colorPrimario = input.colorPrimario;
  if (input.colorSecundario !== undefined) data.colorSecundario = input.colorSecundario;
  if (input.zonaHoraria !== undefined) data.zonaHoraria = input.zonaHoraria;

  const empresa = await prisma.empresa.update({
    where: { id: user.empresaId },
    data,
    select: SELECT_EMPRESA,
  });

  await prisma.auditLog.create({
    data: {
      empresaId: user.empresaId,
      usuarioId: user.userId,
      accion: 'ACTUALIZAR',
      entidad: 'Empresa',
      entidadId: user.empresaId,
      metadata: { campos: Object.keys(input) },
    },
  });

  return empresa;
}

// ───────────────────────────────────────────────────────────────────────────
//  ACTUALIZAR CONFIGURACIÓN
// ───────────────────────────────────────────────────────────────────────────

export async function actualizarConfiguracion(user: UserCtx, input: ActualizarConfiguracionInput) {
  if (!ROLES_GESTION.includes(user.rol)) throw Errors.forbidden();
  if (!user.empresaId) throw Errors.forbidden('Sin empresa asignada');

  await prisma.configuracionEmpresa.upsert({
    where: { empresaId: user.empresaId },
    create: { empresaId: user.empresaId, ...input },
    update: input,
  });

  await prisma.auditLog.create({
    data: {
      empresaId: user.empresaId,
      usuarioId: user.userId,
      accion: 'ACTUALIZAR',
      entidad: 'ConfiguracionEmpresa',
      entidadId: user.empresaId,
      metadata: { campos: Object.keys(input) },
    },
  });

  return obtenerEmpresa(user);
}
