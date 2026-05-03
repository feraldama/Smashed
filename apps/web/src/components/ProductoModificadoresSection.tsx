'use client';

import { ChevronDown, ChevronUp, Loader2, Plus, Sliders, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { toast } from '@/components/Toast';
import { type ProductoDetalle } from '@/hooks/useCatalogo';
import {
  useDesvincularModificadorDeProducto,
  useModificadores,
  useVincularModificadorAProducto,
} from '@/hooks/useModificadores';
import { ApiError } from '@/lib/api';
import { cn, formatGs } from '@/lib/utils';

interface Props {
  producto: ProductoDetalle;
}

export function ProductoModificadoresSection({ producto }: Props) {
  const { data: gruposCatalogo = [], isLoading: loadingCatalogo } = useModificadores();
  const vincular = useVincularModificadorAProducto();
  const desvincular = useDesvincularModificadorDeProducto();

  const [grupoAAgregar, setGrupoAAgregar] = useState('');

  // Lista vinculada al producto, ordenada
  const vinculados = useMemo(
    () => [...producto.modificadorGrupos].sort((a, b) => a.ordenEnProducto - b.ordenEnProducto),
    [producto.modificadorGrupos],
  );
  const idsVinculados = new Set(vinculados.map((v) => v.modificadorGrupoId));
  const disponibles = gruposCatalogo.filter((g) => !idsVinculados.has(g.id));

  async function handleAgregar() {
    if (!grupoAAgregar) return;
    const maxOrden = vinculados.reduce((m, v) => Math.max(m, v.ordenEnProducto), -1);
    try {
      await vincular.mutateAsync({
        grupoId: grupoAAgregar,
        productoVentaId: producto.id,
        ordenEnProducto: maxOrden + 1,
      });
      setGrupoAAgregar('');
      toast.success('Grupo vinculado');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al vincular');
    }
  }

  async function handleDesvincular(grupoId: string, nombre: string) {
    if (!confirm(`¿Desvincular "${nombre}" de este producto?`)) return;
    try {
      await desvincular.mutateAsync({ grupoId, productoVentaId: producto.id });
      toast.success('Grupo desvinculado');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al desvincular');
    }
  }

  // Mover: re-ejecuta vincular (upsert) en ambos vecinos con sus órdenes intercambiadas
  async function mover(idx: number, dir: -1 | 1) {
    const otroIdx = idx + dir;
    if (otroIdx < 0 || otroIdx >= vinculados.length) return;
    const a = vinculados[idx];
    const b = vinculados[otroIdx];
    if (!a || !b) return;
    try {
      await Promise.all([
        vincular.mutateAsync({
          grupoId: a.modificadorGrupoId,
          productoVentaId: producto.id,
          ordenEnProducto: b.ordenEnProducto,
        }),
        vincular.mutateAsync({
          grupoId: b.modificadorGrupoId,
          productoVentaId: producto.id,
          ordenEnProducto: a.ordenEnProducto,
        }),
      ]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al reordenar');
    }
  }

  const isPending = vincular.isPending || desvincular.isPending;

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sliders className="h-3.5 w-3.5" /> Modificadores
        </h2>
        <Link
          href="/modificadores"
          className="text-[11px] text-muted-foreground underline hover:text-foreground"
        >
          gestionar grupos
        </Link>
      </div>

      {vinculados.length === 0 ? (
        <p className="mb-3 rounded-md border border-dashed bg-muted/20 p-3 text-center text-xs text-muted-foreground">
          Este producto no tiene modificadores vinculados.
        </p>
      ) : (
        <ul className="mb-3 space-y-2">
          {vinculados.map((v, idx) => (
            <li
              key={v.modificadorGrupoId}
              className="flex items-center gap-2 rounded-md border bg-muted/10 p-2"
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => void mover(idx, -1)}
                  disabled={idx === 0 || isPending}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                  aria-label="Mover arriba"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => void mover(idx, 1)}
                  disabled={idx === vinculados.length - 1 || isPending}
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                  aria-label="Mover abajo"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">
                    {v.modificadorGrupo.nombre}
                  </span>
                  <span
                    className={cn(
                      'rounded-full border px-1.5 py-0 text-[9px] font-bold uppercase',
                      v.modificadorGrupo.tipo === 'UNICA'
                        ? 'border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-200'
                        : 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200',
                    )}
                  >
                    {v.modificadorGrupo.tipo}
                  </span>
                  {v.modificadorGrupo.obligatorio && (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0 text-[9px] font-bold uppercase text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                      Obligatorio
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {v.modificadorGrupo.opciones.length} opc ·{' '}
                  {v.modificadorGrupo.opciones
                    .slice(0, 3)
                    .map(
                      (o) =>
                        `${o.nombre}${
                          Number(o.precioExtra) > 0 ? ` (+${formatGs(o.precioExtra)})` : ''
                        }`,
                    )
                    .join(', ')}
                  {v.modificadorGrupo.opciones.length > 3 ? '…' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void handleDesvincular(v.modificadorGrupoId, v.modificadorGrupo.nombre)
                }
                disabled={isPending}
                className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                aria-label="Desvincular"
                title="Desvincular del producto"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {loadingCatalogo ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Cargando grupos…
        </div>
      ) : disponibles.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {gruposCatalogo.length === 0 ? (
            <>
              No hay grupos creados todavía.{' '}
              <Link href="/modificadores" className="underline hover:text-foreground">
                Crear el primero
              </Link>
              .
            </>
          ) : (
            'Todos los grupos ya están vinculados a este producto.'
          )}
        </p>
      ) : (
        <div className="flex gap-2">
          <select
            value={grupoAAgregar}
            onChange={(e) => setGrupoAAgregar(e.target.value)}
            disabled={isPending}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">— Elegí un grupo para agregar —</option>
            {disponibles.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre} · {g.tipo} · {g.opciones.length} opc
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleAgregar()}
            disabled={!grupoAAgregar || isPending}
            className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {vincular.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Agregar
          </button>
        </div>
      )}
    </section>
  );
}
