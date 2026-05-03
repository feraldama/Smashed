'use client';

import {
  BellRing,
  CheckCircle2,
  ChefHat,
  HandPlatter,
  Loader2,
  Store,
  Truck,
  User,
  Utensils,
} from 'lucide-react';

import { Cronometro } from '@/components/kds/Cronometro';
import { toast } from '@/components/Toast';
import {
  type KdsItem,
  type KdsItemCombo,
  type KdsPedido,
  type SectorComanda,
  useEntregarPedido,
  useTransicionarComboOpcion,
  useTransicionarItem,
} from '@/hooks/useKds';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  pedido: KdsPedido;
  /** Sector activo del KDS. null = vista Mostrador (todo el pedido, read-only). */
  sector: SectorComanda | null;
}

const TIPO_ICON = {
  MOSTRADOR: Store,
  MESA: Utensils,
  DELIVERY: Truck,
} as const;

/**
 * Una "tarea" del KDS es la unidad mínima accionable: un item no-combo entero,
 * o una opción de combo (que cocina/bar marca independiente del resto).
 */
type Tarea =
  | { kind: 'item'; item: KdsItem }
  | { kind: 'opcion'; opcion: KdsItemCombo; parent: KdsItem };

function tareaKey(t: Tarea): string {
  return t.kind === 'item' ? `i:${t.item.id}` : `o:${t.opcion.id}`;
}

function tareaEstado(t: Tarea) {
  return t.kind === 'item' ? t.item.estado : t.opcion.estado;
}

function tareaSector(t: Tarea): SectorComanda | null {
  return t.kind === 'item'
    ? t.item.productoVenta.sectorComanda
    : (t.opcion.sectorComanda ?? t.opcion.comboGrupoOpcion.productoVenta.sectorComanda);
}

/**
 * Expande los items del pedido en tareas individuales, filtradas por sector.
 * Cancela queda fuera siempre. En Mostrador (sector=null) entra todo.
 */
function expandirTareas(pedido: KdsPedido, sector: SectorComanda | null): Tarea[] {
  const out: Tarea[] = [];
  for (const item of pedido.items) {
    if (item.estado === 'CANCELADO') continue;
    if (item.combosOpcion.length === 0) {
      if (sector && item.productoVenta.sectorComanda !== sector) continue;
      out.push({ kind: 'item', item });
    } else {
      for (const opcion of item.combosOpcion) {
        if (opcion.estado === 'CANCELADO') continue;
        const opcSector =
          opcion.sectorComanda ?? opcion.comboGrupoOpcion.productoVenta.sectorComanda;
        if (sector && opcSector !== sector) continue;
        out.push({ kind: 'opcion', opcion, parent: item });
      }
    }
  }
  return out;
}

export function PedidoCard({ pedido, sector }: Props) {
  const transicionItem = useTransicionarItem();
  const transicionOpcion = useTransicionarComboOpcion();
  const entregar = useEntregarPedido();
  const Icon = TIPO_ICON[pedido.tipo];
  const isMostrador = sector === null;
  const loading = transicionItem.isPending || transicionOpcion.isPending || entregar.isPending;

  const tiempoEsperado = pedido.items.reduce(
    (acc, it) => Math.max(acc, it.productoVenta.tiempoPrepSegundos ?? 0),
    0,
  );

  const tareas = expandirTareas(pedido, sector);
  const activas = tareas.filter((t) => tareaEstado(t) !== 'LISTO');
  const listas = tareas.filter((t) => tareaEstado(t) === 'LISTO');

  async function marcarTarea(t: Tarea, estado: 'EN_PREPARACION' | 'LISTO') {
    try {
      if (t.kind === 'item') {
        await transicionItem.mutateAsync({ pedidoId: pedido.id, itemId: t.item.id, estado });
      } else {
        await transicionOpcion.mutateAsync({
          pedidoId: pedido.id,
          comboOpcionId: t.opcion.id,
          estado,
        });
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al actualizar');
    }
  }

  async function handleMarcarTodoListo() {
    if (activas.length === 0) return;
    try {
      // Marcamos en serie para que el backend cascadee correctamente
      // (item LISTO → pedido LISTO al final).
      for (const t of activas) {
        await marcarTarea(t, 'LISTO');
      }
      toast.success(
        sector
          ? `Listo lo de ${labelSector(sector)} en pedido #${pedido.numero}`
          : `Pedido #${pedido.numero} listo`,
      );
    } catch {
      // marcarTarea ya muestra toast en error
    }
  }

  async function handleEntregar() {
    try {
      await entregar.mutateAsync(pedido.id);
      toast.success(`Pedido #${pedido.numero} entregado`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al entregar');
    }
  }

  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border-2 bg-card shadow-sm',
        pedido.estado === 'EN_PREPARACION' ? 'border-amber-300' : 'border-input',
      )}
    >
      {/* Header */}
      <header className="flex items-start gap-2 border-b bg-muted/30 px-3 py-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-bold tabular-nums">#{pedido.numero}</p>
            {pedido.mesa && (
              <p className="text-sm font-semibold text-muted-foreground">
                Mesa {pedido.mesa.numero}
              </p>
            )}
            {pedido.numeroPager != null && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-sm font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                <BellRing className="h-3.5 w-3.5" />
                Pager {pedido.numeroPager}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{labelTipo(pedido.tipo)}</span>
            {pedido.cliente && (
              <>
                <span>·</span>
                <User className="h-3 w-3" />
                <span className="truncate">{pedido.cliente.razonSocial}</span>
              </>
            )}
          </div>
        </div>
        <Cronometro
          desde={pedido.confirmadoEn ?? new Date().toISOString()}
          tiempoEsperadoSegundos={tiempoEsperado || null}
        />
      </header>

      {/* Tareas activas */}
      <div className="flex-1">
        <ul className="divide-y">
          {activas.map((t) => {
            // En Mostrador, las bebidas (BAR) son "tomar y entregar" — el cajero
            // las marca listo directamente sin pasar por el bar. Para todo lo demás
            // en Mostrador, sólo se ve el estado (cocina/bar marcan desde su tab).
            const tSector = tareaSector(t);
            const mostradorPuedeMarcar = isMostrador && tSector === 'BAR';
            const tareaReadOnly = isMostrador && !mostradorPuedeMarcar;
            return (
              <TareaRow
                key={tareaKey(t)}
                tarea={t}
                loading={loading}
                readOnly={tareaReadOnly}
                soloListo={mostradorPuedeMarcar}
                onMarcarPreparando={() => {
                  void marcarTarea(t, 'EN_PREPARACION');
                }}
                onMarcarListo={() => {
                  void marcarTarea(t, 'LISTO');
                }}
              />
            );
          })}
          {listas.length > 0 && (
            <li className="bg-emerald-50 px-3 py-1.5 dark:bg-emerald-950/20">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Listos: {listas.length}
              </p>
              <ul className="mt-0.5 text-xs text-muted-foreground">
                {listas.map((t) => (
                  <li key={tareaKey(t)} className="truncate">
                    ✓ {tareaResumen(t)}
                  </li>
                ))}
              </ul>
            </li>
          )}
          {tareas.length === 0 && (
            <li className="px-3 py-3 text-center text-xs text-muted-foreground">
              Nada para este sector
            </li>
          )}
        </ul>
      </div>

      {/* Observaciones del pedido */}
      {pedido.observaciones && (
        <div className="border-t bg-amber-50 px-3 py-1.5 text-xs italic text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {pedido.observaciones}
        </div>
      )}

      {/* Footer */}
      <footer className="border-t bg-muted/20 p-2">
        {isMostrador ? (
          activas.length === 0 ? (
            <button
              type="button"
              onClick={() => {
                void handleEntregar();
              }}
              disabled={loading}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <HandPlatter className="h-4 w-4" />
              )}
              Entregar al cliente
            </button>
          ) : (
            <div className="flex w-full items-center justify-center gap-1.5 rounded-md bg-muted px-3 py-2 text-sm font-bold text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              Pendientes: {activas.length}
            </div>
          )
        ) : (
          <button
            type="button"
            onClick={() => {
              void handleMarcarTodoListo();
            }}
            disabled={activas.length === 0 || loading}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {activas.length === 0
              ? `Listo en ${labelSector(sector)}`
              : `Marcar todo listo (${activas.length})`}
          </button>
        )}
      </footer>
    </article>
  );
}

function TareaRow({
  tarea,
  loading,
  readOnly,
  soloListo = false,
  onMarcarPreparando,
  onMarcarListo,
}: {
  tarea: Tarea;
  loading: boolean;
  readOnly: boolean;
  /** Si true, oculta el botón "Preparando" (uso típico: bebidas en Mostrador). */
  soloListo?: boolean;
  onMarcarPreparando: () => void;
  onMarcarListo: () => void;
}) {
  const estado = tareaEstado(tarea);
  const enPrep = estado === 'EN_PREPARACION';
  const sector = tareaSector(tarea);

  return (
    <li className={cn('px-3 py-2', enPrep && 'bg-amber-50 dark:bg-amber-950/20')}>
      <div className="flex items-start gap-2">
        {tarea.kind === 'item' ? (
          <span className="shrink-0 rounded-md bg-primary/10 px-1.5 text-base font-bold tabular-nums text-primary">
            {tarea.item.cantidad}×
          </span>
        ) : (
          <span className="shrink-0 rounded-md bg-blue-100 px-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
            combo
          </span>
        )}
        <div className="flex-1">
          {tarea.kind === 'item' ? (
            <p className="font-semibold">{tarea.item.productoVenta.nombre}</p>
          ) : (
            <>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {tarea.parent.cantidad}× {tarea.parent.productoVenta.nombre} ·{' '}
                {tarea.opcion.comboGrupo.nombre}
              </p>
              <p className="font-semibold">{tarea.opcion.comboGrupoOpcion.productoVenta.nombre}</p>
            </>
          )}

          {tarea.kind === 'item' && tarea.item.modificadores.length > 0 && (
            <ul className="mt-0.5 text-[11px] text-amber-900 dark:text-amber-300">
              {tarea.item.modificadores.map((m) => (
                <li key={m.id}>+ {m.modificadorOpcion.nombre}</li>
              ))}
            </ul>
          )}

          {tarea.kind === 'item' && tarea.item.observaciones && (
            <p className="mt-0.5 text-[11px] italic text-amber-700 dark:text-amber-400">
              ⚠ {tarea.item.observaciones}
            </p>
          )}

          {sector && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ChefHat className="h-2.5 w-2.5" />
              {labelSector(sector)}
            </span>
          )}

          {!readOnly && (
            <div className="mt-1.5 flex gap-1.5">
              {!enPrep && !soloListo && (
                <button
                  type="button"
                  onClick={onMarcarPreparando}
                  disabled={loading}
                  className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 disabled:opacity-50"
                >
                  Preparando
                </button>
              )}
              <button
                type="button"
                onClick={onMarcarListo}
                disabled={loading}
                className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950/30 disabled:opacity-50"
              >
                ✓ Listo
              </button>
            </div>
          )}
          {readOnly && (
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide">
              {estado === 'LISTO' ? (
                <span className="text-emerald-700 dark:text-emerald-400">✓ Listo</span>
              ) : enPrep ? (
                <span className="text-amber-700 dark:text-amber-400">En preparación</span>
              ) : (
                <span className="text-muted-foreground">Pendiente</span>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function tareaResumen(t: Tarea): string {
  if (t.kind === 'item') return `${t.item.cantidad}× ${t.item.productoVenta.nombre}`;
  return `${t.parent.productoVenta.nombre} · ${t.opcion.comboGrupoOpcion.productoVenta.nombre}`;
}

function labelTipo(t: string): string {
  switch (t) {
    case 'MESA':
      return 'Mesa';
    case 'MOSTRADOR':
      return 'Mostrador';
    case 'DELIVERY':
      return 'Delivery';
    default:
      return t;
  }
}

function labelSector(s: SectorComanda): string {
  switch (s) {
    case 'COCINA_CALIENTE':
      return 'Cocina caliente';
    case 'COCINA_FRIA':
      return 'Cocina fría';
    case 'PARRILLA':
      return 'Parrilla';
    case 'BAR':
      return 'Bar';
    case 'CAFETERIA':
      return 'Cafetería';
    case 'POSTRES':
      return 'Postres';
    default:
      return s;
  }
}
