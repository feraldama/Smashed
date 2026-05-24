'use client';

import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Loader2,
  Package,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { ProducirLoteModal } from '@/components/ProducirLoteModal';
import { toast } from '@/components/Toast';
import { Switch } from '@/components/ui/Switch';
import {
  type Subpreparacion,
  useCambiarModoStock,
  useSubpreparaciones,
} from '@/hooks/useSubpreparaciones';
import { useSucursales } from '@/hooks/useSucursales';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function SubpreparacionesPage() {
  return (
    <AuthGate>
      <AdminShell>
        <SubpreparacionesScreen />
      </AdminShell>
    </AuthGate>
  );
}

function SubpreparacionesScreen() {
  const user = useAuthStore((s) => s.user);
  const { data: sucursales = [] } = useSucursales();

  const [busqueda, setBusqueda] = useState('');
  const [sucursalId, setSucursalId] = useState(user?.sucursalActivaId ?? '');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [producirModal, setProducirModal] = useState<Subpreparacion | null>(null);

  const { data: subpreps = [], isLoading } = useSubpreparaciones({
    sucursalId: sucursalId || undefined,
    busqueda: busqueda.trim() || undefined,
  });

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totales = {
    total: subpreps.length,
    enLote: subpreps.filter((s) => s.receta?.modoStock === 'LOTE').length,
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FlaskConical className="h-6 w-6 text-primary" />
            Sub-preparaciones
          </h1>
          <p className="text-sm text-muted-foreground">
            {totales.total} sub-prep · {totales.enLote} en modo LOTE con stock propio
          </p>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar sub-preparación..."
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          value={sucursalId}
          onChange={(e) => setSucursalId(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Todas las sucursales</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : subpreps.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          <FlaskConical className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="mb-1 font-medium text-foreground">Sin sub-preparaciones</p>
          <p>
            Creá productos marcados como <em>esPreparacion=true</em> con su receta desde la pantalla
            de Productos.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {subpreps.map((s) => (
            <SubprepCard
              key={s.id}
              subprep={s}
              expanded={expanded.has(s.id)}
              onToggle={() => toggleExpanded(s.id)}
              onProducir={() => setProducirModal(s)}
              sucursalIdFiltro={sucursalId}
            />
          ))}
        </div>
      )}

      {producirModal && (
        <ProducirLoteModal subprep={producirModal} onClose={() => setProducirModal(null)} />
      )}
    </div>
  );
}

function SubprepCard({
  subprep,
  expanded,
  onToggle,
  onProducir,
  sucursalIdFiltro,
}: {
  subprep: Subpreparacion;
  expanded: boolean;
  onToggle: () => void;
  onProducir: () => void;
  sucursalIdFiltro: string;
}) {
  const cambiar = useCambiarModoStock();
  const receta = subprep.receta;
  const enLote = receta?.modoStock === 'LOTE';
  const espejo = receta?.productoInventarioEspejo ?? null;

  async function handleToggleModo() {
    if (!receta) {
      toast.error('La sub-preparación no tiene receta — definila desde Productos');
      return;
    }
    const nuevoModo = enLote ? 'CALCULADA' : 'LOTE';
    try {
      await cambiar.mutateAsync({ id: subprep.id, modoStock: nuevoModo });
      toast.success(
        nuevoModo === 'LOTE'
          ? 'Modo LOTE activado. Se creó (o reutilizó) el inventario espejo.'
          : 'Modo CALCULADA — al vender se descuentan insumos crudos.',
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al cambiar modo');
    }
  }

  const stockMostrar = espejo?.stockSucursal ?? [];

  return (
    <article className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="text-base font-semibold">{subprep.nombre}</h2>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              enLote
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
                : 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
            )}
          >
            {enLote ? 'LOTE' : 'CALCULADA'}
          </span>
          {!receta && (
            <span className="flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="h-3 w-3" /> Sin receta
            </span>
          )}
        </button>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Modo LOTE</span>
            <Switch
              size="sm"
              checked={enLote}
              onCheckedChange={() => {
                void handleToggleModo();
              }}
              disabled={!receta || cambiar.isPending}
              aria-label="Cambiar modo de stock"
            />
          </div>
          {enLote && (
            <button
              type="button"
              onClick={onProducir}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90"
            >
              <Sparkles className="h-3.5 w-3.5" /> Producir lote
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-4 px-4 py-3">
          {/* Stock del espejo */}
          {enLote && espejo ? (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Package className="h-3.5 w-3.5" /> Stock del lote — {espejo.nombre}
              </h3>
              {stockMostrar.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sin stock registrado todavía en{' '}
                  {sucursalIdFiltro ? 'esta sucursal' : 'ninguna sucursal'}.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {stockMostrar.map((s) => {
                    const actual = Number.parseFloat(s.stockActual);
                    const bajo =
                      Number.parseFloat(s.stockMinimo) > 0 &&
                      actual <= Number.parseFloat(s.stockMinimo);
                    return (
                      <li key={s.sucursalId} className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          {s.sucursal?.nombre ?? 'Sucursal'}
                        </span>
                        <span
                          className={cn(
                            'font-mono text-sm',
                            actual < 0 && 'text-destructive',
                            bajo && actual >= 0 && 'text-amber-700 dark:text-amber-300',
                          )}
                        >
                          {actual.toFixed(3)} {espejo.unidadMedida.toLowerCase()}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}

          {/* Receta */}
          {receta && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Receta {receta.rinde ? `· rinde ${receta.rinde}` : ''}
              </h3>
              {receta.items.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin ingredientes definidos</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {receta.items.map((i) => (
                    <li key={i.id} className="flex items-center justify-between">
                      <span>
                        {i.insumo?.nombre ?? i.subProducto?.nombre ?? '—'}
                        {i.esOpcional && (
                          <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                            opcional
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {Number.parseFloat(i.cantidad)} {i.unidadMedida.toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!enLote && (
            <p className="rounded-md border border-blue-200 bg-blue-50/50 p-2 text-[11px] text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
              En modo CALCULADA, al vender un producto que usa esta sub-preparación se descuentan
              automáticamente los insumos crudos de la receta. Activá LOTE si preferís producir en
              batch y controlar el stock del lote preparado.
            </p>
          )}
        </div>
      )}
    </article>
  );
}
