/**
 * Tipos compartidos entre apps (DTOs, enums no-Prisma, contratos de Socket.io, etc.).
 * Los tipos generados por Prisma se importan directo desde @prisma/client en la API.
 * Acá viven los tipos que el frontend necesita sin tener que depender de Prisma.
 */

export type Money = number; // guaraníes enteros

export type SucursalId = string; // UUID
export type EmpresaId = string;
export type UserId = string;

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Permisos de menú ────────────────────────────────────────────────────

export type RolCode =
  | 'SUPER_ADMIN'
  | 'ADMIN_EMPRESA'
  | 'GERENTE_SUCURSAL'
  | 'CAJERO'
  | 'COCINA'
  | 'MESERO'
  | 'REPARTIDOR';

/** Roles configurables en la matriz de menús (SUPER_ADMIN siempre ve todo). */
export const ROLES_CONFIGURABLES: readonly RolCode[] = [
  'ADMIN_EMPRESA',
  'GERENTE_SUCURSAL',
  'CAJERO',
  'COCINA',
  'MESERO',
  'REPARTIDOR',
] as const;

/** Catálogo de un menú visible en la UI. */
export interface MenuDefinicion {
  /** Path absoluto único (también es la "key" del menú). */
  path: string;
  /** Label para UI. */
  label: string;
  /** Grupo del sidebar (Catálogo, Inventario, etc.). */
  grupo: string;
  /** Roles permitidos por default (al crear empresa o "Restaurar defaults"). */
  defaults: readonly RolCode[];
  /**
   * Si true, este menú no se puede sacar al rol que lo tiene como home
   * (ej. /pos para CAJERO/MESERO; /kds para COCINA; /entregas para REPARTIDOR).
   * El backend rechaza intentos de borrar la fila del par (rol, menu) bloqueado.
   */
  bloqueado?: { rol: RolCode; razon: string }[];
}

const ROLES_ADMIN: RolCode[] = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL'];
const ROLES_GESTION: RolCode[] = ['ADMIN_EMPRESA'];
const ROLES_OPERATIVOS: RolCode[] = ['CAJERO', 'MESERO', 'GERENTE_SUCURSAL', 'ADMIN_EMPRESA'];
const ROLES_ENTREGAS: RolCode[] = [
  'CAJERO',
  'MESERO',
  'REPARTIDOR',
  'GERENTE_SUCURSAL',
  'ADMIN_EMPRESA',
];
const ROLES_KITCHEN: RolCode[] = [
  'COCINA',
  'CAJERO',
  'MESERO',
  'GERENTE_SUCURSAL',
  'ADMIN_EMPRESA',
];

/**
 * Catálogo centralizado de menús del sistema.
 * Esta es la fuente de verdad para:
 *  - Generar defaults al crear empresa o resetear permisos.
 *  - Validar que un menú existe al guardar la matriz.
 *  - Renderizar el sidebar y la pantalla de configuración de permisos.
 */
export const MENU_DEFINICIONES: readonly MenuDefinicion[] = [
  { path: '/', label: 'Dashboard', grupo: 'General', defaults: ROLES_ADMIN },

  // Catálogo
  { path: '/productos', label: 'Productos', grupo: 'Catálogo', defaults: ROLES_ADMIN },
  { path: '/combos', label: 'Combos', grupo: 'Catálogo', defaults: ROLES_ADMIN },
  { path: '/categorias', label: 'Categorías', grupo: 'Catálogo', defaults: ROLES_ADMIN },
  {
    path: '/modificadores',
    label: 'Modificadores',
    grupo: 'Catálogo',
    defaults: ROLES_ADMIN,
  },

  // Inventario
  { path: '/insumos', label: 'Insumos', grupo: 'Inventario', defaults: ROLES_ADMIN },
  { path: '/proveedores', label: 'Proveedores', grupo: 'Inventario', defaults: ROLES_ADMIN },
  { path: '/compras', label: 'Compras', grupo: 'Inventario', defaults: ROLES_ADMIN },
  {
    path: '/transferencias',
    label: 'Transferencias',
    grupo: 'Inventario',
    defaults: ROLES_ADMIN,
  },

  // Ventas
  {
    path: '/pos',
    label: 'POS — Vender',
    grupo: 'Ventas',
    defaults: ROLES_OPERATIVOS,
    bloqueado: [
      { rol: 'CAJERO', razon: 'Sin /pos el cajero no puede vender' },
      { rol: 'MESERO', razon: 'Sin /pos el mesero no puede tomar pedidos' },
    ],
  },
  { path: '/caja', label: 'Caja', grupo: 'Ventas', defaults: ROLES_OPERATIVOS },
  {
    path: '/kds',
    label: 'Cocina (KDS)',
    grupo: 'Ventas',
    defaults: ROLES_KITCHEN,
    bloqueado: [{ rol: 'COCINA', razon: 'Sin /kds cocina no puede ver pedidos' }],
  },
  {
    path: '/entregas',
    label: 'Entregas',
    grupo: 'Ventas',
    defaults: ROLES_ENTREGAS,
    bloqueado: [{ rol: 'REPARTIDOR', razon: 'Sin /entregas el repartidor no puede operar' }],
  },
  { path: '/clientes', label: 'Clientes', grupo: 'Ventas', defaults: ROLES_ADMIN },
  { path: '/comprobantes', label: 'Comprobantes', grupo: 'Ventas', defaults: ROLES_ADMIN },

  // Análisis
  { path: '/reportes', label: 'Reportes', grupo: 'Análisis', defaults: ROLES_ADMIN },

  // Configuración
  { path: '/salon', label: 'Salón / Mesas', grupo: 'Configuración', defaults: ROLES_ADMIN },
  { path: '/cajas', label: 'Cajas', grupo: 'Configuración', defaults: ROLES_ADMIN },
  { path: '/permisos', label: 'Permisos', grupo: 'Configuración', defaults: ROLES_GESTION },
  { path: '/usuarios', label: 'Usuarios', grupo: 'Configuración', defaults: ROLES_GESTION },
  { path: '/sucursales', label: 'Sucursales', grupo: 'Configuración', defaults: ROLES_GESTION },
  { path: '/empresa', label: 'Empresa', grupo: 'Configuración', defaults: ROLES_GESTION },
] as const;

/** Lookup helper. */
export function findMenuDefinicion(path: string): MenuDefinicion | undefined {
  return MENU_DEFINICIONES.find((m) => m.path === path);
}
