'use client';

import { Check, Hash, Loader2, Play, Truck, Users } from 'lucide-react';

import { Timer } from './Timer';

import { useCambiarEstadoItem, type KdsPedido } from '@/hooks/useKds';
import { cn } from '@/lib/utils';


interface PedidoKdsCardProps {
  pedido: KdsPedido;
  // Si está provisto, sólo se muestran items de ese sector.
  filtroSector?: string | null;
}

export function PedidoKdsCard({ pedido, filtroSector }: PedidoKdsCardProps) {
  const cambiarEstado = useCambiarEstadoItem();

  // Filtrar items por sector si aplica
  const items = pedido.items.filter((it) => {
    if (!filtroSector) return true;
    return it.sectorComanda === filtroSector || it.productoVenta.sectorComanda === filtroSector;
  });

  if (items.length === 0) return null;

  const tipoIcon = pedido.tipo === 'MESA' ? Users : pedido.tipo.includes('DELIVERY') ? Truck : Hash;
  const TipoIcon = tipoIcon;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <TipoIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-base font-bold text-foreground">#{pedido.numero}</span>
          {pedido.mesa && (
            <span className="rounded-md bg-primary/20 px-1.5 py-0.5 text-xs font-semibold text-primary">
              Mesa {pedido.mesa.numero}
            </span>
          )}
          {pedido.estado === 'EN_PREPARACION' && (
            <span className="rounded-md bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-400">
              Preparando
            </span>
          )}
        </div>
        <Timer since={pedido.confirmadoEn} />
      </div>

      {/* Items */}
      <ul className="divide-y divide-border">
        {items.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            onComenzar={() =>
              cambiarEstado.mutate({ pedidoId: pedido.id, itemId: it.id, estado: 'EN_PREPARACION' })
            }
            onListo={() =>
              cambiarEstado.mutate({ pedidoId: pedido.id, itemId: it.id, estado: 'LISTO' })
            }
            mutating={cambiarEstado.isPending}
          />
        ))}
      </ul>

      {pedido.observaciones && (
        <div className="border-t border-border bg-amber-500/5 px-3 py-2 text-xs italic text-amber-300">
          📝 {pedido.observaciones}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  onComenzar,
  onListo,
  mutating,
}: {
  item: KdsPedido['items'][number];
  onComenzar: () => void;
  onListo: () => void;
  mutating: boolean;
}) {
  const enPrep = item.estado === 'EN_PREPARACION';

  return (
    <li className="px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            <span className="mr-1.5 inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded bg-primary/20 px-1 text-xs font-bold text-primary">
              {item.cantidad}×
            </span>
            {item.productoVenta.nombre}
          </p>

          {/* Detalles: combo + modificadores */}
          {(item.combosOpcion.length > 0 || item.modificadores.length > 0) && (
            <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
              {item.combosOpcion.map((co, i) => (
                <li key={`c-${i}`} className="truncate">
                  └ {co.comboGrupo.nombre}: {co.comboGrupoOpcion.productoVenta.nombre}
                </li>
              ))}
              {item.modificadores.map((m, i) => (
                <li key={`m-${i}`}>· {m.modificadorOpcion.nombre}</li>
              ))}
            </ul>
          )}

          {item.observaciones && (
            <p className="mt-1 text-[11px] italic text-amber-300">"{item.observaciones}"</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          {!enPrep ? (
            <button
              type="button"
              onClick={onComenzar}
              disabled={mutating}
              className={cn(
                'flex items-center gap-1 rounded-md bg-blue-500/20 px-2 py-1 text-xs font-semibold text-blue-300',
                'hover:bg-blue-500/30 disabled:opacity-50',
              )}
              aria-label="Comenzar preparación"
            >
              {mutating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              Empezar
            </button>
          ) : null}
          <button
            type="button"
            onClick={onListo}
            disabled={mutating}
            className={cn(
              'flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300',
              'hover:bg-emerald-500/30 disabled:opacity-50',
            )}
            aria-label="Marcar listo"
          >
            {mutating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Listo
          </button>
        </div>
      </div>
    </li>
  );
}
