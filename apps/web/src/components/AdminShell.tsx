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
import { useEffect, useRef } from 'react';

import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { puedeAcceder } from '@/lib/permissions';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group?: string;
}

const NAV: NavItem[] = [
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
  const itemsPermitidos = NAV.filter((item) => puedeAcceder(user?.menusPermitidos, item.href));

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
            <span className="text-lg font-bold">S</span>
          </div>
          <div>
            <p className="text-sm font-bold">Smash</p>
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
        {/* Topbar mobile */}
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 lg:hidden">
          <h1 className="text-lg font-bold">
            Smash <span className="text-primary">Admin</span>
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
