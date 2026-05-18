'use client';

import { ChefHat, ChevronRight, Layers, Loader2, Search, Tag, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { type FiltroRecetas, type RecetaListItem, useRecetas } from '@/hooks/useInventario';
import { cn } from '@/lib/utils';

export default function RecetasPage() {
  return (
    <AuthGate>
      <AdminShell>
        <RecetasScreen />
      </AdminShell>
    </AuthGate>
  );
}

function RecetasScreen() {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroRecetas>('TODOS');
  const { data: recetas = [], isLoading } = useRecetas({
    busqueda: busqueda.trim() || undefined,
    filtro,
  });

  const totalSub = recetas.filter((r) => r.productoVenta.esPreparacion).length;
  const totalVendibles = recetas.length - totalSub;

  return (
    <div>
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ChefHat className="h-6 w-6 text-primary" />
          Recetas
        </h1>
        <p className="text-sm text-muted-foreground">
          {recetas.length} receta{recetas.length !== 1 ? 's' : ''} · {totalSub} sub-preparación
          {totalSub !== 1 ? 'es' : ''} · {totalVendibles} producto{totalVendibles !== 1 ? 's' : ''}{' '}
          vendible
          {totalVendibles !== 1 ? 's' : ''}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código…"
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted"
              aria-label="Limpiar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="inline-flex overflow-hidden rounded-md border">
          {(['TODOS', 'SUB', 'VENDIBLE'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filtro === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-accent',
              )}
            >
              {f === 'TODOS' ? 'Todas' : f === 'SUB' ? 'Sub-preparaciones' : 'Vendibles'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : recetas.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          <ChefHat className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="mb-1 font-medium text-foreground">
            {busqueda || filtro !== 'TODOS'
              ? 'No hay recetas que coincidan con el filtro'
              : 'Todavía no cargaste ninguna receta'}
          </p>
          {!busqueda && filtro === 'TODOS' && (
            <p>
              Andá a{' '}
              <Link className="text-primary underline" href="/productos">
                Productos
              </Link>
              , elegí uno, y configurá su receta. También podés crear sub-preparaciones marcando "Es
              sub-preparación" en el producto.
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {recetas.map((r) => (
            <RecetaRow key={r.id} receta={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RecetaRow({ receta: r }: { receta: RecetaListItem }) {
  const sub = r.productoVenta.esPreparacion;
  return (
    <li>
      <Link
        href={`/productos/${r.productoVenta.id}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/30"
      >
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
            sub
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
          )}
        >
          {sub ? <Layers className="h-5 w-5" /> : <ChefHat className="h-5 w-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{r.productoVenta.nombre}</p>
            {sub && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                Sub-preparación
              </span>
            )}
            {!r.productoVenta.activo && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                Inactivo
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {r.productoVenta.codigo && <span className="font-mono">{r.productoVenta.codigo}</span>}
            {r.productoVenta.categoria && (
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3 w-3" /> {r.productoVenta.categoria.nombre}
              </span>
            )}
            <span>
              {r.cantidadItems} item{r.cantidadItems !== 1 ? 's' : ''}
            </span>
            <span>Rinde: {Number.parseFloat(r.rinde).toString()}</span>
            {r.usadaEn > 0 && (
              <span>
                Usada en <strong className="text-foreground">{r.usadaEn}</strong> receta
                {r.usadaEn !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}
