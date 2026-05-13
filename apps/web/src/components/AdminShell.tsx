'use client';

import {
  BarChart3,
  Boxes,
  Building2,
  Armchair,
  Calculator,
  ChefHat,
  ClipboardList,
  FileText,
  Layers,
  LayoutDashboard,
  LogOut,
  LogIn,
  type LucideIcon,
  Package,
  PackageCheck,
  ScanLine,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sliders,
  Tags,
  Truck,
  UserCog,
  Users,
  Utensils,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { toast } from '@/components/Toast';
import { useSalirDeOperar } from '@/hooks/useAdminEmpresas';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { puedeAcceder } from '@/lib/permissions';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group?: string;
  /**
   * Si es true, el item se muestra solo para SUPER_ADMIN y se saltea el
   * filtro `puedeAcceder` (que es por empresa). Útil para pantallas
   * transversales del operador del SaaS.
   */
  superAdminOnly?: boolean;
}

const NAV: NavItem[] = [
  {
    href: '/admin/empresas',
    label: 'Empresas',
    icon: Building2,
    group: 'Super-admin',
    superAdminOnly: true,
  },
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, group: 'General' },
  { href: '/productos', label: 'Productos', icon: Utensils, group: 'Catálogo' },
  { href: '/combos', label: 'Combos', icon: Layers, group: 'Catálogo' },
  { href: '/categorias', label: 'Categorías', icon: Tags, group: 'Catálogo' },
  { href: '/modificadores', label: 'Modificadores', icon: Sliders, group: 'Catálogo' },
  { href: '/insumos', label: 'Insumos', icon: Boxes, group: 'Inventario' },
  { href: '/proveedores', label: 'Proveedores', icon: Package, group: 'Inventario' },
  { href: '/compras', label: 'Compras', icon: ShoppingCart, group: 'Inventario' },
  { href: '/transferencias', label: 'Transferencias', icon: Truck, group: 'Inventario' },
  { href: '/pos', label: 'POS — Vender', icon: ScanLine, group: 'Ventas' },
  { href: '/caja', label: 'Caja', icon: Wallet, group: 'Ventas' },
  { href: '/caja/cierres', label: 'Cierres Z', icon: Calculator, group: 'Ventas' },
  { href: '/kds', label: 'Cocina (KDS)', icon: ChefHat, group: 'Ventas' },
  { href: '/entregas', label: 'Entregas', icon: PackageCheck, group: 'Ventas' },
  { href: '/pedidos', label: 'Pedidos', icon: ClipboardList, group: 'Ventas' },
  { href: '/clientes', label: 'Clientes', icon: Users, group: 'Ventas' },
  { href: '/comprobantes', label: 'Comprobantes', icon: FileText, group: 'Ventas' },
  { href: '/reportes', label: 'Reportes', icon: BarChart3, group: 'Análisis' },
  { href: '/salon', label: 'Salón / Mesas', icon: Armchair, group: 'Configuración' },
  { href: '/cajas', label: 'Cajas', icon: Wallet, group: 'Configuración' },
  { href: '/permisos', label: 'Permisos', icon: ShieldCheck, group: 'Configuración' },
  { href: '/usuarios', label: 'Usuarios', icon: UserCog, group: 'Configuración' },
  { href: '/sucursales', label: 'Sucursales', icon: Building2, group: 'Configuración' },
  { href: '/empresa', label: 'Empresa', icon: Settings, group: 'Configuración' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);

  // Filtrar NAV por permisos del rol actual y agrupar por sección.
  // Los items `superAdminOnly` no pasan por la matriz `MenuRol` (que es por
  // empresa) — se muestran sólo si el usuario es SUPER_ADMIN.
  const esSuperAdmin = user?.rol === 'SUPER_ADMIN';
  const empresaOperando = useAuthStore((s) => s.empresaOperando);
  // SUPER_ADMIN sin operar = operador del SaaS puro: solo ve sus propias
  // pantallas (admin/*). Las pantallas operativas (productos, sucursales,
  // POS, etc.) son por empresa y requieren entrar al modo Operar primero.
  const esSuperAdminPuro = esSuperAdmin && !empresaOperando;
  // Nombre a mostrar en el header del sidebar:
  //  1) Si SUPER_ADMIN está operando como empresa X → nombre de X
  //  2) Si el usuario tiene empresa → nombre de su empresa
  //  3) Fallback: "Smash" (SUPER_ADMIN puro / operador del SaaS)
  const nombreEmpresaHeader = empresaOperando?.nombreFantasia ?? user?.empresaNombre ?? 'Smash';
  const inicialEmpresaHeader = nombreEmpresaHeader.charAt(0).toUpperCase();
  const itemsPermitidos = NAV.filter((item) => {
    if (item.superAdminOnly) return esSuperAdmin;
    if (esSuperAdminPuro) return false;
    return puedeAcceder(user?.menusPermitidos, item.href);
  });

  // El href "activo" es el MÁS LARGO que matchea el pathname actual. Así
  // estando en `/caja/cierres`, sólo se ilumina "Cierres Z" (no "Caja"
  // también, que también matchea por prefijo).
  const activeHref = itemsPermitidos.reduce<string | null>((best, item) => {
    const matches =
      item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname?.startsWith(`${item.href}/`);
    if (!matches) return best;
    if (best === null || item.href.length > best.length) return item.href;
    return best;
  }, null);
  const grupos = itemsPermitidos.reduce<Record<string, NavItem[]>>((acc, item) => {
    const g = item.group ?? 'General';
    (acc[g] ??= []).push(item);
    return acc;
  }, {});

  // Scroll automático del sidebar para que el item activo siempre sea visible.
  // Usa "nearest" para no mover el scroll si ya está a la vista.
  useEffect(() => {
    activeLinkRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [pathname]);

  async function logout() {
    await api('/auth/logout', { method: 'POST', skipAuth: true }).catch(() => {});
    clear();
    window.location.href = '/login';
  }

  return (
    // En desktop: viewport fijo en altura (h-screen) y los hijos manejan su propio scroll.
    // En mobile: layout en bloque que scrollea como página normal.
    <div className="min-h-screen bg-background lg:flex lg:h-screen lg:overflow-hidden">
      {/* Sidebar — header/footer fijos, nav scrolleable */}
      <aside className="hidden w-60 shrink-0 border-r bg-card lg:flex lg:h-screen lg:flex-col">
        {/* Header fijo */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-lg font-bold">{inicialEmpresaHeader}</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{nombreEmpresaHeader}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Admin</p>
          </div>
        </div>

        {/* Nav scrolleable */}
        <nav className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
          {Object.entries(grupos).map(([grupo, items]) => (
            <div key={grupo} className="mb-4">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {grupo}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = item.href === activeHref;
                  return (
                    <li key={item.href}>
                      <Link
                        ref={active ? activeLinkRef : undefined}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors',
                          active
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer fijo */}
        <div className="shrink-0 border-t p-3">
          <p className="truncate text-xs font-semibold">{user?.nombreCompleto}</p>
          <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
          <button
            type="button"
            onClick={() => {
              void logout();
            }}
            className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido — scroll propio en desktop, scroll de página en mobile */}
      <main className="flex-1 overflow-x-hidden lg:h-screen lg:overflow-y-auto">
        {/* Banner de modo "Operar como empresa" — visible si SUPER_ADMIN está
            impersonando a una empresa específica. */}
        <ModoOperarBanner />

        {/* Topbar mobile */}
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 lg:hidden">
          <h1 className="text-lg font-bold">
            {nombreEmpresaHeader} <span className="text-primary">Admin</span>
          </h1>
          <button
            type="button"
            onClick={() => {
              void logout();
            }}
            className="rounded-md border border-input p-2"
            aria-label="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <div className="container mx-auto px-4 py-6">{children}</div>
      </main>
    </div>
  );
}

/**
 * Banner amarillo persistente cuando un SUPER_ADMIN está operando como una
 * empresa específica (modo "impersonate"). Reemite el access token al salir
 * para volver al contexto sin empresaId.
 */
function ModoOperarBanner() {
  const empresaOperando = useAuthStore((s) => s.empresaOperando);
  const setEmpresaOperando = useAuthStore((s) => s.setEmpresaOperando);
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setSucursalActiva = useAuthStore((s) => s.setSucursalActiva);
  const salir = useSalirDeOperar();
  const [saliendo, setSaliendo] = useState(false);

  if (!empresaOperando) return null;

  async function handleSalir() {
    setSaliendo(true);
    try {
      const r = await salir.mutateAsync();
      setAccessToken(r.accessToken);
      setSucursalActiva(null);
      setEmpresaOperando(null);
      toast.success('Volviste al modo super-admin');
      // Redirección dura para limpiar cualquier query cacheada por TanStack
      // que dependa del contexto de la empresa anterior.
      window.location.href = '/admin/empresas';
    } catch (err) {
      setSaliendo(false);
      toast.error(err instanceof ApiError ? err.message : 'No se pudo salir');
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm dark:border-amber-700 dark:bg-amber-950/40">
      <div className="flex min-w-0 items-center gap-2 text-amber-900 dark:text-amber-100">
        <Building2 className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Estás operando como <strong>{empresaOperando.nombreFantasia}</strong>
          <span className="ml-1 hidden text-xs text-amber-800 sm:inline dark:text-amber-300">
            ({empresaOperando.razonSocial})
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          void handleSalir();
        }}
        disabled={saliendo}
        className="flex shrink-0 items-center gap-1 rounded-md border border-amber-500 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-60 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
      >
        <LogIn className="h-3.5 w-3.5 rotate-180" />
        {saliendo ? 'Saliendo...' : 'Salir'}
      </button>
    </div>
  );
}
