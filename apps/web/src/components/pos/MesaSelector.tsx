'use client';

import { Loader2, Users, X } from 'lucide-react';

import { type EstadoMesa, type Mesa, useZonasMesas } from '@/hooks/useMesas';
import { cn } from '@/lib/utils';

interface Props {
  mesaSeleccionadaId: string | null;
  onSeleccionar: (m: Mesa) => void;
  onClose: () => void;
}

const ESTADO_STYLE: Record<EstadoMesa, string> = {
  LIBRE:
    'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50',
  OCUPADA: 'border-red-400 bg-red-100 hover:bg-red-200 dark:bg-red-950/40 dark:hover:bg-red-900/50',
  RESERVADA: 'border-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30',
  LIMPIEZA: 'border-slate-300 bg-slate-100 cursor-not-allowed opacity-60 dark:bg-slate-800/50',
};

const ESTADO_LABEL: Record<EstadoMesa, string> = {
  LIBRE: 'Libre',
  OCUPADA: 'Ocupada',
  RESERVADA: 'Reservada',
  LIMPIEZA: 'Limpieza',
};

export function MesaSelector({ mesaSeleccionadaId, onSeleccionar, onClose }: Props) {
  const { data: zonas = [], isLoading } = useZonasMesas();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-bold">Elegí una mesa</h2>
          <button type="button" onClick={onClose} className="rounded-sm p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : zonas.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              No hay mesas configuradas en esta sucursal.
            </p>
          ) : (
            <div className="space-y-5">
              {zonas.map((zona) => (
                <section key={zona.id}>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    {zona.nombre}
                  </h3>
                  <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(80px,1fr))]">
                    {zona.mesas.map((m) => {
                      // OCUPADA es seleccionable: significa "agregar a la cuenta abierta".
                      // LIMPIEZA queda deshabilitada porque la mesa todavía no se puede usar.
                      const disabled = m.estado === 'LIMPIEZA';
                      const selected = mesaSeleccionadaId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => !disabled && onSeleccionar(m)}
                          className={cn(
                            'flex aspect-square flex-col items-center justify-center rounded-md border-2 p-2 text-center transition-colors',
                            ESTADO_STYLE[m.estado],
                            selected && 'ring-2 ring-primary ring-offset-2',
                          )}
                        >
                          <p className="text-xl font-bold">{m.numero}</p>
                          <p className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Users className="h-2.5 w-2.5" />
                            {m.capacidad}
                          </p>
                          <p className="mt-0.5 text-[9px] uppercase tracking-wide">
                            {m.estado === 'OCUPADA' && m.pedidoActivo
                              ? `#${m.pedidoActivo.numero}`
                              : ESTADO_LABEL[m.estado]}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Leyenda */}
        <div className="flex flex-wrap gap-3 border-t bg-muted/20 px-4 py-2 text-[10px] uppercase tracking-wide">
          <Leyenda color="bg-emerald-500" label="Libre · nuevo pedido" />
          <Leyenda color="bg-red-500" label="Ocupada · agregar a cuenta" />
          <Leyenda color="bg-amber-500" label="Reservada" />
          <Leyenda color="bg-slate-400" label="Limpieza" />
        </div>
      </div>
    </div>
  );
}

function Leyenda({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <span className={cn('h-2.5 w-2.5 rounded-full', color)} />
      {label}
    </span>
  );
}
