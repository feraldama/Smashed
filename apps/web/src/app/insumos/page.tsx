'use client';

import {
  Boxes,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AjusteStockModal } from '@/components/AjusteStockModal';
import { AuthGate } from '@/components/AuthGate';
import { InsumoFormModal } from '@/components/InsumoFormModal';
import { toast } from '@/components/Toast';
import { type Insumo, useEliminarInsumo, useInsumos } from '@/hooks/useInventario';
import { ApiError } from '@/lib/api';
import { cn, formatGs } from '@/lib/utils';

export default function InsumosPage() {
  return (
    <AuthGate>
      <AdminShell>
        <InsumosScreen />
      </AdminShell>
    </AuthGate>
  );
}

function InsumosScreen() {
  const [busqueda, setBusqueda] = useState('');
  const [editing, setEditing] = useState<Insumo | 'NEW' | null>(null);
  const [ajustar, setAjustar] = useState<Insumo | null>(null);

  const { data, isLoading } = useInsumos({ busqueda: busqueda.trim() || undefined });
  const insumos = data?.insumos ?? [];
  const eliminar = useEliminarInsumo();

  async function handleEliminar(i: Insumo) {
    if (!confirm(`Eliminar el insumo "${i.nombre}"?`)) return;
    try {
      await eliminar.mutateAsync(i.id);
      toast.success('Insumo eliminado');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insumos</h1>
          <p className="text-sm text-muted-foreground">
            {insumos.length} insumo{insumos.length !== 1 ? 's' : ''} · stock de la sucursal activa
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing('NEW')}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nuevo insumo
        </button>
      </header>

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, código, categoría..."
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
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : insumos.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <Boxes className="mx-auto mb-2 h-8 w-8 opacity-30" />
          {busqueda ? 'No hay coincidencias' : 'Sin insumos — agregá el primero'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Código</th>
                <th className="px-4 py-2 text-left">Nombre</th>
                <th className="px-4 py-2 text-left">Categoría</th>
                <th className="px-4 py-2 text-right">Costo unit.</th>
                <th className="px-4 py-2 text-right">Stock</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {insumos.map((i) => {
                const stockNum = i.stock ? Number(i.stock.stockActual) : 0;
                const stockMin = i.stock ? Number(i.stock.stockMinimo) : 0;
                const stockBajo = stockMin > 0 && stockNum <= stockMin;
                return (
                  <tr key={i.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                      {i.codigo ?? '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{i.nombre}</p>
                      {i.proveedor && (
                        <p className="text-[11px] text-muted-foreground">
                          {i.proveedor.razonSocial}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {i.categoria ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {formatGs(i.costoUnitario)} / {i.unidadMedida.toLowerCase()}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {i.stock ? (
                        <div className="inline-flex flex-col items-end">
                          <span
                            className={cn(
                              'font-mono font-semibold',
                              stockNum < 0 && 'text-destructive',
                              stockBajo && stockNum >= 0 && 'text-amber-600',
                            )}
                          >
                            {Number(i.stock.stockActual).toFixed(2)} {i.unidadMedida.toLowerCase()}
                          </span>
                          {stockBajo && (
                            <span className="text-[10px] text-amber-600">stock bajo</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setAjustar(i)}
                          className="flex items-center gap-1 rounded-md border border-input px-2 py-1 text-[11px] hover:bg-accent"
                          aria-label="Ajustar stock"
                        >
                          <TrendingUp className="h-3 w-3" />
                          <TrendingDown className="h-3 w-3 -ml-2 opacity-50" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(i)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                          aria-label="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleEliminar(i);
                          }}
                          disabled={eliminar.isPending}
                          className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing === 'NEW' && <InsumoFormModal onClose={() => setEditing(null)} />}
      {editing && editing !== 'NEW' && (
        <InsumoFormModal insumo={editing} onClose={() => setEditing(null)} />
      )}

      {ajustar && (
        <AjusteStockModal
          productoInventarioId={ajustar.id}
          insumoNombre={ajustar.nombre}
          unidad={ajustar.unidadMedida.toLowerCase()}
          stockActual={ajustar.stock?.stockActual ?? '0'}
          onClose={() => setAjustar(null)}
        />
      )}
    </div>
  );
}
