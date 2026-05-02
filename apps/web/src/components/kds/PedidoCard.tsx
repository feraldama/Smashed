'use client';

import { CheckCircle2, ChefHat, Loader2, Store, Truck, User, Utensils } from 'lucide-react';

import { Cronometro } from '@/components/kds/Cronometro';
import { toast } from '@/components/Toast';
import { type KdsItem, type KdsPedido, useTransicionarItem } from '@/hooks/useKds';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  pedido: KdsPedido;
}

const TIPO_ICON = {
  MOSTRADOR: Store,
  MESA: Utensils,
  DELIVERY: Truck,
} as const;

export function PedidoCard({ pedido }: Props) {
  const transicion = useTransicionarItem();
  const Icon = TIPO_ICON[pedido.tipo];

  // Tiempo estimado total = max de los items
  const tiempoEsperado = pedido.items.reduce(
    (acc, it) => Math.max(acc, it.productoVenta.tiempoPrepSegundos ?? 0),
    0,
  );

  // Items pendientes y en preparación
  const itemsActivos = pedido.items.filter((i) => i.estado !== 'LISTO');
  const itemsListos = pedido.items.filter((i) => i.estado === 'LISTO');

  async function handleItemAction(item: KdsItem, estado: 'EN_PREPARACION' | 'LISTO') {
    try {
      await transicion.mutateAsync({ pedidoId: pedido.id, itemId: item.id, estado });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al actualizar item');
    }
  }

  async function handleMarcarTodoListo() {
    const pendientes = itemsActivos;
    if (pendientes.length === 0) return;
    try {
      // Marcamos en serie para que el backend pueda promover el pedido a LISTO
      // cuando el último item se marque.
      for (const it of pendientes) {
        await transicion.mutateAsync({ pedidoId: pedido.id, itemId: it.id, estado: 'LISTO' });
      }
      toast.success(`Pedido #${pedido.numero} listo`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al marcar listo');
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

      {/* Items */}
      <div className="flex-1">
        <ul className="divide-y">
          {itemsActivos.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              onMarcarPreparando={() => handleItemAction(it, 'EN_PREPARACION')}
              onMarcarListo={() => handleItemAction(it, 'LISTO')}
              loading={transicion.isPending}
            />
          ))}
          {itemsListos.length > 0 && (
            <li className="bg-emerald-50 px-3 py-1.5 dark:bg-emerald-950/20">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Listos: {itemsListos.length}
              </p>
              <ul className="mt-0.5 text-xs text-muted-foreground">
                {itemsListos.map((it) => (
                  <li key={it.id} className="truncate">
                    ✓ {it.cantidad}× {it.productoVenta.nombre}
                  </li>
                ))}
              </ul>
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
        <button
          type="button"
          onClick={handleMarcarTodoListo}
          disabled={itemsActivos.length === 0 || transicion.isPending}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
        >
          {transicion.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {itemsActivos.length === 0 ? 'Pedido listo' : 'Marcar todo listo'}
        </button>
      </footer>
    </article>
  );
}

function ItemRow({
  item,
  onMarcarPreparando,
  onMarcarListo,
  loading,
}: {
  item: KdsItem;
  onMarcarPreparando: () => void;
  onMarcarListo: () => void;
  loading: boolean;
}) {
  return (
    <li
      className={cn(
        'px-3 py-2',
        item.estado === 'EN_PREPARACION' && 'bg-amber-50 dark:bg-amber-950/20',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 rounded-md bg-primary/10 px-1.5 text-base font-bold tabular-nums text-primary">
          {item.cantidad}×
        </span>
        <div className="flex-1">
          <p className="font-semibold">{item.productoVenta.nombre}</p>

          {/* Combo opciones */}
          {item.combosOpcion.length > 0 && (
            <ul className="mt-0.5 text-[11px] text-muted-foreground">
              {item.combosOpcion.map((c) => (
                <li key={c.id}>
                  · {c.comboGrupo.nombre}:{' '}
                  <strong>{c.comboGrupoOpcion.productoVenta.nombre}</strong>
                </li>
              ))}
            </ul>
          )}

          {/* Modificadores */}
          {item.modificadores.length > 0 && (
            <ul className="mt-0.5 text-[11px] text-amber-900 dark:text-amber-300">
              {item.modificadores.map((m) => (
                <li key={m.id}>+ {m.modificadorOpcion.nombre}</li>
              ))}
            </ul>
          )}

          {item.observaciones && (
            <p className="mt-0.5 text-[11px] italic text-amber-700 dark:text-amber-400">
              ⚠ {item.observaciones}
            </p>
          )}

          {item.productoVenta.sectorComanda && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ChefHat className="h-2.5 w-2.5" />
              {item.productoVenta.sectorComanda}
            </span>
          )}

          {/* Acciones */}
          <div className="mt-1.5 flex gap-1.5">
            {item.estado !== 'EN_PREPARACION' && (
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
        </div>
      </div>
    </li>
  );
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
