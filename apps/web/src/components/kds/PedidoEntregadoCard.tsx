'use client';

import {
  BellRing,
  CheckCircle2,
  HandPlatter,
  Loader2,
  RotateCcw,
  Store,
  Truck,
  User,
  Utensils,
} from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { type KdsPedido, useReabrirPedido } from '@/hooks/useKds';
import { ApiError } from '@/lib/api';

interface Props {
  pedido: KdsPedido;
}

const TIPO_ICON = {
  MOSTRADOR: Store,
  MESA: Utensils,
  DELIVERY_PROPIO: Truck,
  DELIVERY_PEDIDOSYA: Truck,
  RETIRO_LOCAL: HandPlatter,
} as const;

/**
 * Tarjeta de solo lectura para la vista "Entregados" (recall). Muestra el
 * pedido tal como se entregó y permite reabrirlo (deshacer la entrega) con una
 * confirmación de dos pasos, por si se entregó por error.
 */
export function PedidoEntregadoCard({ pedido }: Props) {
  const reabrir = useReabrirPedido();
  const [confirmando, setConfirmando] = useState(false);

  const Icon = TIPO_ICON[pedido.tipo] ?? Store;
  // Sólo se puede reabrir un pedido ENTREGADO (mesa con cuenta abierta). Si ya
  // está FACTURADO (fast-food cobrado) el backend lo rechaza — no ofrecemos la
  // acción para no hacer clickear un error.
  const reabrible = pedido.estado === 'ENTREGADO';

  async function handleReabrir() {
    try {
      await reabrir.mutateAsync(pedido.id);
      toast.success(`Pedido #${pedido.numero} reabierto`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al reabrir');
      setConfirmando(false);
    }
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border-2 border-input bg-card opacity-90 shadow-sm">
      {/* Header */}
      <header className="flex items-start gap-2 border-b bg-muted/30 px-3 py-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
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
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-sm font-bold text-muted-foreground">
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
        <div className="flex shrink-0 items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {pedido.entregadoEn ? horaEntrega(pedido.entregadoEn) : 'Entregado'}
        </div>
      </header>

      {/* Items (solo lectura) */}
      <div className="flex-1 px-3 py-2 text-sm">
        <ul className="space-y-1.5">
          {pedido.items
            .filter((it) => it.estado !== 'CANCELADO')
            .map((it) => (
              <li key={it.id}>
                <p className="font-medium">
                  {it.cantidad}× {it.productoVenta.nombre}
                </p>
                {it.combosOpcion.length > 0 && (
                  <ul className="ml-4 mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                    {it.combosOpcion
                      .filter((o) => o.estado !== 'CANCELADO')
                      .map((o) => (
                        <li key={o.id}>+ {o.comboGrupoOpcion.productoVenta.nombre}</li>
                      ))}
                  </ul>
                )}
                {it.modificadores.length > 0 && (
                  <ul className="ml-4 mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                    {it.modificadores.map((m) => (
                      <li key={m.id}>· {m.modificadorOpcion.nombre}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
        </ul>
        {pedido.observaciones && (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {pedido.observaciones}
          </p>
        )}
      </div>

      {/* Acción: reabrir con confirmación de dos pasos. Sólo para ENTREGADO;
          un FACTURADO ya está cobrado y no se puede deshacer desde acá. */}
      <footer className="border-t p-2">
        {!reabrible ? (
          <p className="text-center text-xs text-muted-foreground">Facturado</p>
        ) : confirmando ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs font-medium text-muted-foreground">
              ¿Reabrir y devolver a Mostrador?
            </span>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={reabrir.isPending}
              className="rounded-md border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              No
            </button>
            <button
              type="button"
              onClick={() => void handleReabrir()}
              disabled={reabrir.isPending}
              className="flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {reabrir.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Sí, reabrir
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reabrir pedido
          </button>
        )}
      </footer>
    </article>
  );
}

/** Hora de entrega en formato HH:mm (hora local del navegador). */
function horaEntrega(iso: string): string {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function labelTipo(t: string): string {
  switch (t) {
    case 'MESA':
      return 'Mesa';
    case 'MOSTRADOR':
      return 'Mostrador';
    case 'DELIVERY_PROPIO':
      return 'Delivery';
    case 'DELIVERY_PEDIDOSYA':
      return 'PedidosYa';
    case 'RETIRO_LOCAL':
      return 'Retiro';
    default:
      return t;
  }
}
