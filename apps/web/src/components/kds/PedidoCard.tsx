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

/**
 * Estructura de la vista Mostrador: cada combo es una sub-ficha que agrupa sus
 * componentes (hamburguesa → acompañamiento → bebida según `comboGrupo.orden`),
 * y al final se listan los productos sueltos ordenados por sector.
 */
type GrupoKds =
  | { kind: 'combo'; parent: KdsItem; tareas: Tarea[] }
  | { kind: 'sueltos'; tareas: Tarea[] };

// Orden de los sectores para los items sueltos: cocina (hamburguesas/postres)
// arriba, bar al final. Coincide con la secuencia natural de armado de un pedido.
const ORDEN_SECTOR: Record<SectorComanda, number> = {
  COCINA_CALIENTE: 1,
  PARRILLA: 2,
  COCINA_FRIA: 3,
  POSTRES: 4,
  CAFETERIA: 5,
  BAR: 6,
};

function ordenSector(s: SectorComanda | null): number {
  return s ? ORDEN_SECTOR[s] : 99;
}

/**
 * Agrupa las tareas del pedido para la vista del KDS (Mostrador y estación):
 *  1) Sub-fichas de combos primero, con TODAS sus opciones (activas + listas)
 *     ordenadas por `comboGrupo.orden` (hamburguesa → acompañamiento → bebida).
 *     Las opciones listas se quedan en la sub-ficha con check + botón Deshacer.
 *  2) Items sueltos activos (no listos), ordenados por sector.
 *  3) Items sueltos listos en una sección compacta abajo.
 *
 * En vista de estación, las tareas ya vienen filtradas por sector — se siguen
 * agrupando los combos para que la cocina vea "1× COMBO SMASH · Smash Clásica"
 * con su contexto, en vez de una línea suelta.
 */
function armarGruposKdsConListos(tareas: Tarea[]): {
  combos: GrupoKds[];
  sueltosActivos: Tarea[];
  sueltosListos: Tarea[];
} {
  const combosByItemId = new Map<string, Tarea[]>();
  const sueltosActivos: Tarea[] = [];
  const sueltosListos: Tarea[] = [];

  for (const t of tareas) {
    if (t.kind === 'opcion') {
      const arr = combosByItemId.get(t.parent.id) ?? [];
      arr.push(t);
      combosByItemId.set(t.parent.id, arr);
    } else {
      if (tareaEstado(t) === 'LISTO') sueltosListos.push(t);
      else sueltosActivos.push(t);
    }
  }

  const combos: GrupoKds[] = [];
  for (const [, opciones] of combosByItemId) {
    opciones.sort((a, b) => {
      if (a.kind !== 'opcion' || b.kind !== 'opcion') return 0;
      return a.opcion.comboGrupo.orden - b.opcion.comboGrupo.orden;
    });
    const parent = opciones[0]?.kind === 'opcion' ? opciones[0].parent : null;
    if (!parent) continue;
    combos.push({ kind: 'combo', parent, tareas: opciones });
  }

  sueltosActivos.sort((a, b) => ordenSector(tareaSector(a)) - ordenSector(tareaSector(b)));
  sueltosListos.sort((a, b) => ordenSector(tareaSector(a)) - ordenSector(tareaSector(b)));

  return { combos, sueltosActivos, sueltosListos };
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

  // Wrapper sync para pasar como prop sin que ESLint se queje del Promise.
  const onMarcar = (t: Tarea, estado: 'EN_PREPARACION' | 'LISTO') => {
    void marcarTarea(t, estado);
  };

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

  // Tareas pendientes (ni en preparación, ni listas) — son las únicas que
  // tiene sentido mover masivamente a EN_PREPARACION.
  const pendientes = activas.filter((t) => tareaEstado(t) === 'PENDIENTE');

  // Tareas que el cajero (Mostrador) puede marcar listo: BAR y POSTRES son
  // "tomar y entregar". El resto (cocina, parrilla, etc.) lo marca la estación.
  const activasMostrador = activas.filter((t) => {
    const s = tareaSector(t);
    return s === 'BAR' || s === 'POSTRES';
  });

  async function handleMarcarTodoPreparando() {
    if (pendientes.length === 0) return;
    try {
      for (const t of pendientes) {
        await marcarTarea(t, 'EN_PREPARACION');
      }
      toast.success(
        sector
          ? `${pendientes.length} en preparación en ${labelSector(sector)}`
          : `Pedido #${pedido.numero} en preparación`,
      );
    } catch {
      // marcarTarea ya muestra toast en error
    }
  }

  async function handleMarcarMostradorListo() {
    if (activasMostrador.length === 0) return;
    try {
      for (const t of activasMostrador) {
        await marcarTarea(t, 'LISTO');
      }
      toast.success(
        `${activasMostrador.length} bebidas/postres listas en pedido #${pedido.numero}`,
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

      {/* Tareas — sub-fichas de combos (con TODAS sus opciones, listas o activas)
          + items sueltos. Los sueltos listos van compactos abajo. */}
      <div className="flex-1">
        <div className="divide-y">
          {(() => {
            const { combos, sueltosActivos, sueltosListos } = armarGruposKdsConListos(tareas);
            return (
              <>
                {combos.map((g, i) =>
                  g.kind === 'combo' ? (
                    <ComboSubficha
                      key={`c:${g.parent.id}`}
                      parent={g.parent}
                      tareas={g.tareas}
                      loading={loading}
                      isMostrador={isMostrador}
                      alt={i % 2 === 1}
                      onMarcar={onMarcar}
                    />
                  ) : null,
                )}
                {sueltosActivos.length > 0 && (
                  <ul className="divide-y">
                    {sueltosActivos.map((t) => (
                      <TareaRowKds
                        key={tareaKey(t)}
                        tarea={t}
                        loading={loading}
                        isMostrador={isMostrador}
                        onMarcar={onMarcar}
                      />
                    ))}
                  </ul>
                )}
                {sueltosListos.length > 0 && (
                  <div className="bg-emerald-50 px-3 py-1.5 dark:bg-emerald-950/20">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                      Listos sueltos: {sueltosListos.length}
                    </p>
                    <ul className="text-xs text-muted-foreground">
                      {sueltosListos.map((t) => (
                        <li key={tareaKey(t)} className="truncate">
                          ✓ {tareaResumen(t)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {tareas.length === 0 && (
                  <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                    Nada para este sector
                  </p>
                )}
              </>
            );
          })()}
        </div>
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
          ) : activasMostrador.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => {
                  void handleMarcarMostradorListo();
                }}
                disabled={loading}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Listo bebidas/postres ({activasMostrador.length})
              </button>
              {activas.length > activasMostrador.length && (
                <p className="text-center text-[11px] text-muted-foreground">
                  Falta cocina: {activas.length - activasMostrador.length}
                </p>
              )}
            </div>
          ) : (
            <div className="flex w-full items-center justify-center gap-1.5 rounded-md bg-muted px-3 py-2 text-sm font-bold text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              Pendientes: {activas.length}
            </div>
          )
        ) : (
          <div className="flex gap-2">
            {pendientes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  void handleMarcarTodoPreparando();
                }}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-950/30 dark:text-amber-200"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChefHat className="h-4 w-4" />
                )}
                Todo preparando ({pendientes.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                void handleMarcarTodoListo();
              }}
              disabled={activas.length === 0 || loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {activas.length === 0
                ? `Listo en ${labelSector(sector)}`
                : `Todo listo (${activas.length})`}
            </button>
          </div>
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
  enComboSubficha = false,
  onMarcarPreparando,
  onMarcarListo,
}: {
  tarea: Tarea;
  loading: boolean;
  readOnly: boolean;
  /** Si true, oculta el botón "Preparando" (uso típico: bebidas en Mostrador). */
  soloListo?: boolean;
  /** Si true, omite el prefijo "1× Combo Smash · " porque ya está en el header
   * de la sub-ficha del combo. */
  enComboSubficha?: boolean;
  onMarcarPreparando: () => void;
  onMarcarListo: () => void;
}) {
  const estado = tareaEstado(tarea);
  const enPrep = estado === 'EN_PREPARACION';
  const isListo = estado === 'LISTO';
  const sector = tareaSector(tarea);

  return (
    <li
      className={cn(
        'px-3 py-2',
        enPrep && 'bg-amber-50 dark:bg-amber-950/20',
        isListo && 'bg-emerald-50/60 dark:bg-emerald-950/20',
      )}
    >
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
            <p
              className={cn(
                'font-semibold',
                isListo &&
                  'text-emerald-800 line-through decoration-emerald-500/40 dark:text-emerald-300',
              )}
            >
              {tarea.item.productoVenta.nombre}
            </p>
          ) : (
            <>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {enComboSubficha
                  ? tarea.opcion.comboGrupo.nombre
                  : `${tarea.parent.cantidad}× ${tarea.parent.productoVenta.nombre} · ${tarea.opcion.comboGrupo.nombre}`}
              </p>
              <p
                className={cn(
                  'font-semibold',
                  isListo &&
                    'text-emerald-800 line-through decoration-emerald-500/40 dark:text-emerald-300',
                )}
              >
                {tarea.opcion.comboGrupoOpcion.productoVenta.nombre}
              </p>
            </>
          )}

          {/* Modificadores: en `item` mostramos los que aplican al item global
               (sin comboGrupoId). En `opcion` mostramos los que apuntan
               específicamente al componente del combo. */}
          {(() => {
            const mods =
              tarea.kind === 'item'
                ? tarea.item.modificadores.filter((m) => !m.comboGrupo)
                : tarea.parent.modificadores.filter(
                    (m) => m.comboGrupo?.id === tarea.opcion.comboGrupo.id,
                  );
            if (mods.length === 0) return null;
            return (
              <ul className="mt-0.5 text-[11px] text-amber-900 dark:text-amber-300">
                {mods.map((m) => (
                  <li key={m.id}>+ {m.modificadorOpcion.nombre}</li>
                ))}
              </ul>
            );
          })()}

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

          {!readOnly && !isListo && (
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
          {/* Estado LISTO con opción de deshacer (revertir a EN_PREPARACION).
              Útil cuando se marca por accidente. */}
          {!readOnly && isListo && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                ✓ Listo
              </span>
              <button
                type="button"
                onClick={onMarcarPreparando}
                disabled={loading}
                className="rounded border border-input bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                title="Volver a EN_PREPARACION"
              >
                ↶ Deshacer
              </button>
            </div>
          )}
          {readOnly && (
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide">
              {isListo ? (
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

/**
 * Sub-ficha visual para un combo en el KDS (Mostrador o estación).
 * Muestra el header con el nombre del combo y debajo sus opciones, ordenadas
 * según `comboGrupo.orden` (hamburguesa → acompañamiento → bebida).
 */
function ComboSubficha({
  parent,
  tareas,
  loading,
  isMostrador,
  alt,
  onMarcar,
}: {
  parent: KdsItem;
  tareas: Tarea[];
  loading: boolean;
  isMostrador: boolean;
  /** Si true, usa la paleta alternativa (violeta) para zebra-striping entre combos. */
  alt?: boolean;
  onMarcar: (t: Tarea, estado: 'EN_PREPARACION' | 'LISTO') => void;
}) {
  // Dos paletas claras intercaladas para que combos contiguos se distingan
  // de un vistazo. Ambas son "frías" (azul/violeta) — no chocan con los
  // estados amber (preparando) ni emerald (listo).
  const palette = alt
    ? {
        wrapper:
          'border-violet-300 bg-violet-50/30 dark:border-violet-900/50 dark:bg-violet-950/10',
        badge: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
      }
    : {
        wrapper: 'border-blue-300 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-950/10',
        badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
      };
  return (
    <div className={cn('border-l-4', palette.wrapper)}>
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span
          className={cn(
            'rounded-md px-1.5 text-[11px] font-bold uppercase tracking-wide',
            palette.badge,
          )}
        >
          combo
        </span>
        <p className="text-sm font-bold">
          {parent.cantidad}× {parent.productoVenta.nombre}
        </p>
      </div>
      <ul className="divide-y">
        {tareas.map((t) => (
          <TareaRowKds
            key={tareaKey(t)}
            tarea={t}
            loading={loading}
            isMostrador={isMostrador}
            onMarcar={onMarcar}
            enComboSubficha
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * Render de una tarea aplicando la política según el contexto:
 *  - Mostrador: BAR/POSTRES son marcables; el resto es read-only (lo marca la estación).
 *  - Estación: todas las tareas se pueden marcar (Preparando / Listo).
 */
function TareaRowKds({
  tarea,
  loading,
  isMostrador,
  onMarcar,
  enComboSubficha = false,
}: {
  tarea: Tarea;
  loading: boolean;
  isMostrador: boolean;
  onMarcar: (t: Tarea, estado: 'EN_PREPARACION' | 'LISTO') => void;
  enComboSubficha?: boolean;
}) {
  const tSector = tareaSector(tarea);
  const mostradorPuedeMarcar = isMostrador && (tSector === 'BAR' || tSector === 'POSTRES');
  const readOnly = isMostrador && !mostradorPuedeMarcar;
  return (
    <TareaRow
      tarea={tarea}
      loading={loading}
      readOnly={readOnly}
      soloListo={mostradorPuedeMarcar}
      enComboSubficha={enComboSubficha}
      onMarcarPreparando={() => onMarcar(tarea, 'EN_PREPARACION')}
      onMarcarListo={() => onMarcar(tarea, 'LISTO')}
    />
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
