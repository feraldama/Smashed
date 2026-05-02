'use client';

import {
  BarChart3,
  Boxes,
  Building2,
  ChefHat,
  FileText,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Package,
  PackageCheck,
  ScanLine,
  Settings,
  Tags,
  Users,
  Utensils,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
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
  { href: '/categorias', label: 'Categorías', icon: Tags, group: 'Catálogo' },
  { href: '/insumos', label: 'Insumos', icon: Boxes, group: 'Inventario' },
  { href: '/proveedores', label: 'Proveedores', icon: Package, group: 'Inventario' },
  { href: '/pos', label: 'POS — Vender', icon: ScanLine, group: 'Ventas' },
  { href: '/caja', label: 'Caja', icon: Wallet, group: 'Ventas' },
  { href: '/kds', label: 'Cocina (KDS)', icon: ChefHat, group: 'Ventas' },
  { href: '/entregas', label: 'Entregas', icon: PackageCheck, group: 'Ventas' },
  { href: '/clientes', label: 'Clientes', icon: Users, group: 'Ventas' },
  { href: '/comprobantes', label: 'Comprobantes', icon: FileText, group: 'Ventas' },
  { href: '/reportes', label: 'Reportes', icon: BarChart3, group: 'Análisis' },
  { href: '/sucursales', label: 'Sucursales', icon: Building2, group: 'Configuración' },
  { href: '/cocina', label: 'Sectores', icon: ChefHat, group: 'Configuración' },
  { href: '/empresa', label: 'Empresa', icon: Settings, group: 'Configuración' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  // Agrupar items por sección
  const grupos = NAV.reduce<Record<string, NavItem[]>>((acc, item) => {
    const g = item.group ?? 'General';
    (acc[g] ??= []).push(item);
    return acc;
  }, {});

  async function logout() {
    await api('/auth/logout', { method: 'POST', skipAuth: true }).catch(() => {});
    clear();
    window.location.href = '/login';
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 border-r bg-card lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="text-lg font-bold">S</span>
          </div>
          <div>
            <p className="text-sm font-bold">Smash</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Admin</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 text-sm">
          {Object.entries(grupos).map(([grupo, items]) => (
            <div key={grupo} className="mb-4">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {grupo}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
                  return (
                    <li key={item.href}>
                      <Link
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

        <div className="border-t p-3">
          <p className="truncate text-xs font-semibold">{user?.nombreCompleto}</p>
          <p className="truncate text-[11px] text-muted-foreground">{user?.email}</p>
          <button
            type="button"
            onClick={logout}
            className="mt-2 flex w-full items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
          >
            <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        {/* Topbar mobile */}
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 lg:hidden">
          <h1 className="text-lg font-bold">
            Smash <span className="text-primary">Admin</span>
          </h1>
          <button
            type="button"
            onClick={logout}
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
