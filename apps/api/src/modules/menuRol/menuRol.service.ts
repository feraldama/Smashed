import { MENU_DEFINICIONES, ROLES_CONFIGURABLES, type RolCode } from '@smash/shared-types';

import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type { ActualizarMatrizInput } from './menuRol.schemas.js';
import type { Rol } from '@prisma/client';

interface UserCtx {
  userId: string;
  empresaId: string | null;
  rol: Rol;
  isSuperAdmin: boolean;
}

/**
 * Devuelve la matriz completa de la empresa: todos los menús del catálogo
 * + los roles configurables + qué (rol, menu) están permitidos.
 */
export async function obtenerMatriz(user: UserCtx) {
  if (!user.empresaId) throw Errors.forbidden('Usuario sin empresa');

  const filas = await prisma.menuRol.findMany({
    where: { empresaId: user.empresaId },
    select: { menu: true, rol: true },
  });

  const asignaciones: Record<RolCode, string[]> = {
    ADMIN_EMPRESA: [],
    GERENTE_SUCURSAL: [],
    CAJERO: [],
    COCINA: [],
    MESERO: [],
    REPARTIDOR: [],
    // SUPER_ADMIN: solo se completa abajo (siempre todo)
    SUPER_ADMIN: MENU_DEFINICIONES.map((m) => m.path),
  };
  for (const f of filas) {
    const rol: RolCode = f.rol;
    if (rol in asignaciones && rol !== 'SUPER_ADMIN') {
      asignaciones[rol].push(f.menu);
    }
  }

  return {
    menus: MENU_DEFINICIONES.map((m) => ({
      path: m.path,
      label: m.label,
      grupo: m.grupo,
      bloqueado: m.bloqueado ?? [],
    })),
    rolesConfigurables: ROLES_CONFIGURABLES,
    asignaciones,
  };
}

/**
 * Devuelve la lista de menús permitidos para un rol concreto en una empresa.
 * - SUPER_ADMIN siempre ve todo (catálogo completo).
 * - El resto: lo que tenga en la tabla MenuRol.
 */
export async function obtenerMenusPermitidos(
  empresaId: string | null,
  rol: Rol,
): Promise<string[]> {
  if (rol === 'SUPER_ADMIN') {
    return MENU_DEFINICIONES.map((m) => m.path);
  }
  if (!empresaId) return [];
  const filas = await prisma.menuRol.findMany({
    where: { empresaId, rol },
    select: { menu: true },
    orderBy: { menu: 'asc' },
  });
  return filas.map((f) => f.menu);
}

/**
 * Reemplaza completamente la matriz de la empresa con la asignación dada.
 *
 * Validaciones:
 *  - Cada path debe existir en MENU_DEFINICIONES.
 *  - SUPER_ADMIN no se puede modificar (siempre ve todo, fuera del schema).
 *  - Las constraints `bloqueado` se respetan (no se puede sacar un menú a un
 *    rol que lo necesita para operar — ej. /pos para CAJERO).
 */
export async function actualizarMatriz(user: UserCtx, input: ActualizarMatrizInput) {
  if (!user.empresaId) throw Errors.forbidden('Usuario sin empresa');

  const pathsValidos = new Set(MENU_DEFINICIONES.map((m) => m.path));

  // Recopilar el set final de filas (rol, menu) que tendría la matriz.
  const filasFinales = new Set<string>(); // "ROL|menu"
  for (const [rol, paths] of Object.entries(input.asignaciones)) {
    // Ignoramos SUPER_ADMIN si viene (no se persiste — siempre ve todo en código).
    if (rol === 'SUPER_ADMIN') continue;
    if (!ROLES_CONFIGURABLES.includes(rol as RolCode)) {
      throw Errors.conflict(`Rol "${rol}" no es configurable`);
    }
    for (const path of paths ?? []) {
      if (!pathsValidos.has(path)) {
        throw Errors.conflict(`Menú "${path}" no existe en el catálogo`);
      }
      filasFinales.add(`${rol}|${path}`);
    }
  }

  // Validar constraints `bloqueado` — cada (rol, menu) bloqueado tiene que estar.
  for (const def of MENU_DEFINICIONES) {
    for (const lock of def.bloqueado ?? []) {
      const key = `${lock.rol}|${def.path}`;
      if (!filasFinales.has(key)) {
        throw Errors.conflict(`No se puede sacar "${def.label}" al rol ${lock.rol}: ${lock.razon}`);
      }
    }
  }

  const empresaId = user.empresaId;
  const filasArray = [...filasFinales].map((s) => {
    const [rolStr, menu] = s.split('|');
    return { empresaId, rol: rolStr as Rol, menu: menu ?? '' };
  });

  await prisma.$transaction([
    prisma.menuRol.deleteMany({ where: { empresaId: user.empresaId } }),
    prisma.menuRol.createMany({ data: filasArray, skipDuplicates: true }),
    prisma.auditLog.create({
      data: {
        empresaId: user.empresaId,
        usuarioId: user.userId,
        accion: 'CAMBIO_PERMISO',
        entidad: 'MenuRol',
        metadata: {
          totalFilas: filasArray.length,
          rolesAfectados: Object.keys(input.asignaciones),
        },
      },
    }),
  ]);

  return obtenerMatriz(user);
}

/**
 * Restaura la matriz a los defaults del catálogo MENU_DEFINICIONES.
 */
export async function resetearMatriz(user: UserCtx) {
  if (!user.empresaId) throw Errors.forbidden('Usuario sin empresa');

  const empresaId = user.empresaId;
  const filasDefault = MENU_DEFINICIONES.flatMap((m) =>
    m.defaults.map((rol) => ({
      empresaId,
      rol,
      menu: m.path,
    })),
  );

  await prisma.$transaction([
    prisma.menuRol.deleteMany({ where: { empresaId: user.empresaId } }),
    prisma.menuRol.createMany({ data: filasDefault, skipDuplicates: true }),
    prisma.auditLog.create({
      data: {
        empresaId: user.empresaId,
        usuarioId: user.userId,
        accion: 'CAMBIO_PERMISO',
        entidad: 'MenuRol',
        metadata: { reset: true, totalFilas: filasDefault.length },
      },
    }),
  ]);

  return obtenerMatriz(user);
}
