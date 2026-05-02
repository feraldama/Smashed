import { Prisma, type Rol } from '@prisma/client';
import bcrypt from 'bcrypt';

import { env } from '../../config/env.js';
import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type {
  ActualizarUsuarioInput,
  CrearUsuarioInput,
  ListarUsuariosQuery,
  ResetPasswordInput,
} from './usuario.schemas.js';

/**
 * Servicio de gestión de usuarios.
 *
 * Reglas:
 *  - Solo SUPER_ADMIN o ADMIN_EMPRESA pueden crear/editar usuarios.
 *  - Tenant guard: ADMIN_EMPRESA solo gestiona usuarios de su empresa.
 *  - SUPER_ADMIN puede operar cross-empresa.
 *  - El password se bcrypt-hashea con BCRYPT_ROUNDS configurado.
 *  - Sucursales asignadas deben pertenecer a la empresa del usuario.
 *  - Si rol es SUPER_ADMIN: empresaId queda null y no requiere sucursales.
 *  - Una sola sucursal puede ser `esPrincipal` por usuario (último gana en updates).
 *  - Soft delete: marca `deletedAt` + `activo=false`. No borra realmente.
 *  - No se puede modificar a uno mismo el `activo` (evita auto-bloqueo).
 *  - No se puede cambiar el rol del super_admin único.
 */

interface UserCtx {
  userId: string;
  empresaId: string | null;
  rol: Rol;
  isSuperAdmin: boolean;
}

const ROLES_GESTION: Rol[] = ['ADMIN_EMPRESA', 'SUPER_ADMIN'];

const SELECT_USUARIO = {
  id: true,
  empresaId: true,
  email: true,
  nombreCompleto: true,
  documento: true,
  telefono: true,
  rol: true,
  activo: true,
  ultimoLogin: true,
  createdAt: true,
  updatedAt: true,
  sucursales: {
    select: {
      sucursalId: true,
      esPrincipal: true,
      sucursal: { select: { id: true, nombre: true, codigo: true } },
    },
  },
} satisfies Prisma.UsuarioSelect;

// ───────────────────────────────────────────────────────────────────────────
//  LIST
// ───────────────────────────────────────────────────────────────────────────

export async function listarUsuarios(user: UserCtx, q: ListarUsuariosQuery) {
  if (!ROLES_GESTION.includes(user.rol)) throw Errors.forbidden('Sin permiso para gestionar usuarios');

  const where: Prisma.UsuarioWhereInput = {
    ...(q.incluirInactivos ? {} : { deletedAt: null }),
    ...(user.isSuperAdmin ? {} : { empresaId: user.empresaId }),
    ...(q.rol ? { rol: q.rol } : {}),
    ...(q.sucursalId ? { sucursales: { some: { sucursalId: q.sucursalId } } } : {}),
    ...(q.busqueda
      ? {
          OR: [
            { nombreCompleto: { contains: q.busqueda, mode: 'insensitive' } },
            { email: { contains: q.busqueda, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const usuarios = await prisma.usuario.findMany({
    where,
    select: SELECT_USUARIO,
    take: q.pageSize,
    orderBy: [{ activo: 'desc' }, { nombreCompleto: 'asc' }],
  });

  return { usuarios };
}

// ───────────────────────────────────────────────────────────────────────────
//  GET BY ID
// ───────────────────────────────────────────────────────────────────────────

export async function obtenerUsuario(user: UserCtx, id: string) {
  if (!ROLES_GESTION.includes(user.rol)) throw Errors.forbidden();
  const u = await prisma.usuario.findUnique({ where: { id }, select: SELECT_USUARIO });
  if (!u) throw Errors.notFound('Usuario no encontrado');
  if (!user.isSuperAdmin && u.empresaId !== user.empresaId) throw Errors.tenantMismatch();
  return u;
}

// ───────────────────────────────────────────────────────────────────────────
//  CREAR
// ───────────────────────────────────────────────────────────────────────────

export async function crearUsuario(user: UserCtx, input: CrearUsuarioInput) {
  if (!ROLES_GESTION.includes(user.rol)) throw Errors.forbidden();

  // Solo SUPER_ADMIN puede crear otro SUPER_ADMIN
  if (input.rol === 'SUPER_ADMIN' && !user.isSuperAdmin) {
    throw Errors.forbidden('Solo SUPER_ADMIN puede crear otro SUPER_ADMIN');
  }

  // ADMIN_EMPRESA solo crea para su empresa
  const empresaId = user.isSuperAdmin && input.rol === 'SUPER_ADMIN' ? null : user.empresaId;
  if (!user.isSuperAdmin && !empresaId) throw Errors.forbidden('Sin empresa asignada');

  // Validar sucursales: deben pertenecer a la empresa
  if (input.sucursales.length > 0 && empresaId) {
    const sucursalesIds = input.sucursales.map((s) => s.sucursalId);
    const sucursales = await prisma.sucursal.findMany({
      where: { id: { in: sucursalesIds }, empresaId },
      select: { id: true },
    });
    if (sucursales.length !== sucursalesIds.length) {
      throw Errors.validation({ sucursales: 'Una o más sucursales no pertenecen a la empresa' });
    }
  }

  // Solo una sucursal puede ser principal
  const principales = input.sucursales.filter((s) => s.esPrincipal);
  if (principales.length > 1) {
    throw Errors.validation({ sucursales: 'Solo una sucursal puede ser principal' });
  }

  // Email único por empresa
  const yaExiste = await prisma.usuario.findFirst({
    where: { email: input.email, empresaId, deletedAt: null },
    select: { id: true },
  });
  if (yaExiste) throw Errors.conflict('Ya existe un usuario con ese email en esta empresa');

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        empresaId,
        email: input.email,
        passwordHash,
        nombreCompleto: input.nombreCompleto,
        documento: input.documento,
        telefono: input.telefono,
        rol: input.rol,
        ...(input.sucursales.length > 0
          ? {
              sucursales: {
                create: input.sucursales.map((s) => ({
                  sucursalId: s.sucursalId,
                  esPrincipal: s.esPrincipal,
                })),
              },
            }
          : {}),
      },
      select: SELECT_USUARIO,
    });

    await tx.auditLog.create({
      data: {
        empresaId: user.empresaId,
        usuarioId: user.userId,
        accion: 'CREAR',
        entidad: 'Usuario',
        entidadId: usuario.id,
        metadata: { email: usuario.email, rol: usuario.rol },
      },
    });

    return usuario;
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  ACTUALIZAR
// ───────────────────────────────────────────────────────────────────────────

export async function actualizarUsuario(user: UserCtx, id: string, input: ActualizarUsuarioInput) {
  if (!ROLES_GESTION.includes(user.rol)) throw Errors.forbidden();

  const target = await prisma.usuario.findUnique({
    where: { id },
    select: { id: true, empresaId: true, rol: true, email: true },
  });
  if (!target) throw Errors.notFound('Usuario no encontrado');
  if (!user.isSuperAdmin && target.empresaId !== user.empresaId) throw Errors.tenantMismatch();

  // No auto-bloquearse
  if (id === user.userId && input.activo === false) {
    throw Errors.conflict('No podés desactivar tu propio usuario');
  }

  // Solo SUPER_ADMIN cambia rol a/desde SUPER_ADMIN
  if (input.rol && (input.rol === 'SUPER_ADMIN' || target.rol === 'SUPER_ADMIN') && !user.isSuperAdmin) {
    throw Errors.forbidden('Solo SUPER_ADMIN puede modificar el rol SUPER_ADMIN');
  }

  // Email único si cambia
  if (input.email && input.email !== target.email) {
    const ya = await prisma.usuario.findFirst({
      where: {
        email: input.email,
        empresaId: target.empresaId,
        deletedAt: null,
        id: { not: id },
      },
      select: { id: true },
    });
    if (ya) throw Errors.conflict('Ya existe un usuario con ese email');
  }

  // Validar sucursales si vienen
  if (input.sucursales) {
    const principales = input.sucursales.filter((s) => s.esPrincipal);
    if (principales.length > 1) {
      throw Errors.validation({ sucursales: 'Solo una sucursal puede ser principal' });
    }
    if (input.sucursales.length > 0 && target.empresaId) {
      const ids = input.sucursales.map((s) => s.sucursalId);
      const sucursales = await prisma.sucursal.findMany({
        where: { id: { in: ids }, empresaId: target.empresaId },
        select: { id: true },
      });
      if (sucursales.length !== ids.length) {
        throw Errors.validation({ sucursales: 'Una o más sucursales no pertenecen a la empresa' });
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    const data: Prisma.UsuarioUpdateInput = {};
    if (input.email !== undefined) data.email = input.email;
    if (input.nombreCompleto !== undefined) data.nombreCompleto = input.nombreCompleto;
    if (input.documento !== undefined) data.documento = input.documento;
    if (input.telefono !== undefined) data.telefono = input.telefono;
    if (input.rol !== undefined) data.rol = input.rol;
    if (input.activo !== undefined) data.activo = input.activo;

    await tx.usuario.update({ where: { id }, data });

    // Reemplazar sucursales si vienen (estilo "set"): borrar las viejas, crear las nuevas
    if (input.sucursales) {
      await tx.usuarioSucursal.deleteMany({ where: { usuarioId: id } });
      if (input.sucursales.length > 0) {
        await tx.usuarioSucursal.createMany({
          data: input.sucursales.map((s) => ({
            usuarioId: id,
            sucursalId: s.sucursalId,
            esPrincipal: s.esPrincipal,
          })),
        });
      }
    }

    await tx.auditLog.create({
      data: {
        empresaId: user.empresaId,
        usuarioId: user.userId,
        accion: 'ACTUALIZAR',
        entidad: 'Usuario',
        entidadId: id,
        metadata: { campos: Object.keys(input) },
      },
    });

    // Re-fetch con sucursales actualizadas
    return tx.usuario.findUniqueOrThrow({ where: { id }, select: SELECT_USUARIO });
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  RESET PASSWORD
// ───────────────────────────────────────────────────────────────────────────

export async function resetPassword(user: UserCtx, id: string, input: ResetPasswordInput) {
  if (!ROLES_GESTION.includes(user.rol)) throw Errors.forbidden();

  const target = await prisma.usuario.findUnique({
    where: { id },
    select: { id: true, empresaId: true, rol: true },
  });
  if (!target) throw Errors.notFound('Usuario no encontrado');
  if (!user.isSuperAdmin && target.empresaId !== user.empresaId) throw Errors.tenantMismatch();
  if (target.rol === 'SUPER_ADMIN' && !user.isSuperAdmin) {
    throw Errors.forbidden('Solo SUPER_ADMIN puede resetear su password');
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id }, data: { passwordHash } });
    // Revocar todos los refresh tokens del usuario para forzar nuevo login
    await tx.refreshToken.updateMany({
      where: { usuarioId: id, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
    await tx.auditLog.create({
      data: {
        empresaId: user.empresaId,
        usuarioId: user.userId,
        accion: 'ACTUALIZAR',
        entidad: 'Usuario',
        entidadId: id,
        metadata: { operacion: 'RESET_PASSWORD' },
      },
    });
  });

  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────
//  ELIMINAR (soft)
// ───────────────────────────────────────────────────────────────────────────

export async function eliminarUsuario(user: UserCtx, id: string) {
  if (!ROLES_GESTION.includes(user.rol)) throw Errors.forbidden();
  if (id === user.userId) throw Errors.conflict('No podés eliminar tu propio usuario');

  const target = await prisma.usuario.findUnique({
    where: { id },
    select: { id: true, empresaId: true, rol: true, deletedAt: true },
  });
  if (!target) throw Errors.notFound('Usuario no encontrado');
  if (!user.isSuperAdmin && target.empresaId !== user.empresaId) throw Errors.tenantMismatch();
  if (target.rol === 'SUPER_ADMIN' && !user.isSuperAdmin) {
    throw Errors.forbidden('Solo SUPER_ADMIN puede eliminar a otro SUPER_ADMIN');
  }
  if (target.deletedAt) throw Errors.conflict('Usuario ya eliminado');

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id },
      data: { deletedAt: new Date(), activo: false },
    });
    await tx.refreshToken.updateMany({
      where: { usuarioId: id, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
    await tx.auditLog.create({
      data: {
        empresaId: user.empresaId,
        usuarioId: user.userId,
        accion: 'ELIMINAR',
        entidad: 'Usuario',
        entidadId: id,
      },
    });
  });

  return { ok: true };
}
