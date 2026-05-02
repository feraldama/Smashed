'use client';

import { ChefHat, ChevronLeft, Filter, Loader2, RefreshCcw, Store } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { AuthGate, ROLES_KITCHEN } from '@/components/AuthGate';
import { PedidoCard } from '@/components/kds/PedidoCard';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { type SectorComanda, useKds } from '@/hooks/useKds';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function KdsPage() {
  return (
    <AuthGate roles={ROLES_KITCHEN}>
      <KdsScreen />
    </AuthGate>
  );
}

const ROLES_ADMIN_FE = new Set(['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN']);

// Sectores con label legible. El primer "tab" es Mostrador (sin filtro = vista
// completa para verificar y entregar al cliente).
const SECTORES: { value: SectorComanda; label: string }[] = [
  { value: 'COCINA_CALIENTE', label: 'Cocina caliente' },
  { value: 'COCINA_FRIA', label: 'Cocina fría' },
  { value: 'PARRILLA', label: 'Parrilla' },
  { value: 'BAR', label: 'Bar' },
  { value: 'CAFETERIA', label: 'Cafetería' },
  { value: 'POSTRES', label: 'Postres' },
];

function KdsScreen() {
  const user = useAuthStore((s) => s.user);
  const esAdmin = user ? ROLES_ADMIN_FE.has(user.rol) : false;
  const [sectorFiltro, setSectorFiltro] = useState<SectorComanda | null>(null);
  const { data: pedidos = [], isLoading, isFetching, refetch } = useKds(sectorFiltro);

  const totalActivos = pedidos.length;
  const enPrep = pedidos.filter((p) => p.estado === 'EN_PREPARACION').length;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Mini header */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
        {esAdmin && (
          <>
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Admin
            </Link>
            <div className="h-6 w-px bg-border" />
          </>
        )}
        <h1 className="flex items-center gap-1.5 text-sm font-bold">
          <ChefHat className="h-4 w-4" /> Cocina · KDS
        </h1>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{totalActivos}</strong> activos
          </span>
          <span>
            <strong className="text-amber-600 dark:text-amber-400">{enPrep}</strong> en prep.
          </span>
          <button
            type="button"
            onClick={() => {
              void refetch();
            }}
            disabled={isFetching}
            className="flex items-center gap-1 rounded-md border border-input px-2 py-1 hover:bg-accent disabled:opacity-50"
            aria-label="Refrescar"
          >
            <RefreshCcw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
            <span className="hidden sm:inline">Refrescar</span>
          </button>
          <span className="hidden text-[11px] sm:inline">{user?.nombreCompleto}</span>
          <LogoutButton compact />
        </div>
      </header>

      {/* Filtro de sectores: Mostrador (sin filtro) + cada sector */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b bg-background px-4 py-2">
        <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <button
          type="button"
          onClick={() => setSectorFiltro(null)}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wide',
            sectorFiltro === null
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent',
          )}
        >
          <Store className="h-3 w-3" /> Mostrador
        </button>
        {SECTORES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSectorFiltro(s.value)}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wide',
              sectorFiltro === s.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Tablero */}
      <main className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pedidos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <ChefHat className="h-16 w-16 opacity-20" />
            <div>
              <p className="text-lg font-semibold">
                {sectorFiltro ? 'No hay pedidos en este sector' : 'Sin pedidos pendientes'}
              </p>
              <p className="text-xs">Los pedidos confirmados aparecen acá automáticamente.</p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {pedidos.map((p) => (
              <PedidoCard key={p.id} pedido={p} sector={sectorFiltro} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
