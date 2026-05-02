'use client';

import { CircleDot, Loader2, Users } from 'lucide-react';

import { type EstadoMesa, type Mesa, useMesas } from '@/hooks/useMesas';
import { cn } from '@/lib/utils';

interface MesaSelectorProps {
  selectedId: string | null;
  onSelect: (mesa: Mesa, label: string) => void;
}

const ESTADOS_OCUPADAS: EstadoMesa[] = ['OCUPADA', 'PRECUENTA'];
const ESTADOS_BLOQUEADAS: EstadoMesa[] = ['LIMPIEZA', 'FUERA_DE_SERVICIO'];

export function MesaSelector({ selectedId, onSelect }: MesaSelectorProps) {
  const { data: zonas, isLoading } = useMesas();

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!zonas || zonas.length === 0) {
    return (
      <p className="rounded-md bg-muted/30 p-4 text-center text-xs text-muted-foreground">
        No hay zonas/mesas configuradas en esta sucursal.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {zonas.map((zona) => (
        <div key={zona.id}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {zona.nombre}
          </p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {zona.mesas.map((m) => {
              const ocupada = ESTADOS_OCUPADAS.includes(m.estado);
              const bloqueada = ESTADOS_BLOQUEADAS.includes(m.estado);
              const reservada = m.estado === 'RESERVADA';
              const seleccionada = selectedId === m.id;

              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={bloqueada}
                  onClick={() => onSelect(m, `Mesa ${m.numero} · ${zona.nombre}`)}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md border p-2 text-xs transition-all',
                    !ocupada &&
                      !bloqueada &&
                      !reservada &&
                      'border-input bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700',
                    ocupada && 'border-primary/40 bg-primary/10 text-primary cursor-pointer',
                    reservada && 'border-amber-500/40 bg-amber-500/10 text-amber-700',
                    bloqueada &&
                      'border-input bg-muted/30 text-muted-foreground cursor-not-allowed opacity-50',
                    seleccionada && 'ring-2 ring-primary ring-offset-2',
                  )}
                  title={
                    m.pedidoActivo
                      ? `Mesa ${m.numero} — Pedido #${m.pedidoActivo.numero} (${m.pedidoActivo.estado})`
                      : `Mesa ${m.numero} — ${m.estado}`
                  }
                >
                  <span className="text-lg font-bold leading-none">{m.numero}</span>
                  <span className="flex items-center gap-0.5 text-[9px]">
                    <Users className="h-2.5 w-2.5" />
                    {m.capacidad}
                  </span>
                  {ocupada && <CircleDot className="h-2.5 w-2.5" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-3 border-t pt-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/30" /> Libre
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/30" /> Ocupada
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/30" /> Reservada
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-muted" /> Bloqueada
        </span>
      </div>
    </div>
  );
}
