/**
 * Permisos de la UI — fuente runtime: la matriz que viene del backend en
 * `user.menusPermitidos` (calculada de `MenuRol` por empresa).
 *
 * Las constantes de roles (ROLES_ADMIN, ROLES_OPERATIVOS, etc.) se exportan
 * para retro-compatibilidad con código que aún las importe; el AuthGate
 * y el sidebar se basan en `menusPermitidos`, no en estas listas.
 */

import { useAuthStore } from './auth-store';

// ───── Grupos de roles (compatibilidad histórica) ─────

export const ROLES_ADMIN = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN'] as const;
export const ROLES_GESTION = ['ADMIN_EMPRESA', 'SUPER_ADMIN'] as const;
export const ROLES_OPERATIVOS = [
  'CAJERO',
  'MESERO',
  'GERENTE_SUCURSAL',
  'ADMIN_EMPRESA',
  'SUPER_ADMIN',
] as const;
export const ROLES_ENTREGAS = [
  'CAJERO',
  'MESERO',
  'REPARTIDOR',
  'GERENTE_SUCURSAL',
  'ADMIN_EMPRESA',
  'SUPER_ADMIN',
] as const;
export const ROLES_KITCHEN = [
  'COCINA',
  'CAJERO',
  'MESERO',
  'GERENTE_SUCURSAL',
  'ADMIN_EMPRESA',
  'SUPER_ADMIN',
] as const;

// ───── Resolución de acceso por ruta ─────

/**
 * Encuentra el "menu key" (path declarado en MENU_DEFINICIONES) que aplica
 * al pathname actual. Hace match por prefijo: `/productos/abc` → `/productos`.
 *
 * Usa la lista de menús que el usuario tiene permitidos como universo de
 * matching — porque esa lista contiene todos los paths del catálogo (cuando
 * un rol no los tiene, simplemente no aparecen ahí).
 */
function resolverMenuKey(menusPermitidos: readonly string[], pathname: string): string | null {
  // Match exacto primero (más específico)
  if (menusPermitidos.includes(pathname)) return pathname;

  // Match por prefijo: tomamos el más largo que sea ancestro del pathname
  let best: string | null = null;
  for (const menu of menusPermitidos) {
    if (menu === '/') continue; // home se matchea solo exacto
    if (pathname.startsWith(`${menu}/`) && (!best || menu.length > best.length)) {
      best = menu;
    }
  }
  return best;
}

/**
 * Determina si el usuario actual puede ver una ruta.
 * Lee `menusPermitidos` del auth-store.
 */
export function puedeAcceder(
  menusPermitidos: readonly string[] | undefined,
  pathname: string,
): boolean {
  if (!menusPermitidos) return false;
  return resolverMenuKey(menusPermitidos, pathname) !== null;
}

/** Hook para uso desde React: devuelve si el usuario actual puede ver la ruta. */
export function usePuedeAcceder(pathname: string): boolean {
  const menus = useAuthStore((s) => s.user?.menusPermitidos);
  return puedeAcceder(menus, pathname);
}
