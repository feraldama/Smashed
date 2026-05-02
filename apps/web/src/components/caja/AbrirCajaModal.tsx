'use client';

import { Loader2, Wallet, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { type CajaListItem, useAbrirCaja } from '@/hooks/useCaja';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  cajasDisponibles: CajaListItem[];
  onClose: () => void;
}

export function AbrirCajaModal({ cajasDisponibles, onClose }: Props) {
  const [cajaId, setCajaId] = useState<string>(cajasDisponibles[0]?.id ?? '');
  const [montoInicial, setMontoInicial] = useState<string>('100000');
  const [notas, setNotas] = useState('');

  const abrir = useAbrirCaja();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cajaId) {
      toast.error('Seleccioná una caja');
      return;
    }
    const monto = parseInt(montoInicial.replace(/\D/g, ''), 10);
    if (!Number.isFinite(monto) || monto < 0) {
      toast.error('Monto inicial inválido');
      return;
    }
    try {
      await abrir.mutateAsync({ cajaId, montoInicial: monto, notas: notas.trim() || undefined });
      toast.success('Caja abierta');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al abrir caja');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold">
            <Wallet className="h-4 w-4" /> Abrir caja
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 hover:bg-muted"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Caja física
            </label>
            <div className="space-y-2">
              {cajasDisponibles.map((c) => {
                const ocupada = c.estado === 'ABIERTA';
                return (
                  <label
                    key={c.id}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-2 rounded-md border p-3 text-sm',
                      cajaId === c.id
                        ? 'border-primary bg-primary/5'
                        : 'border-input hover:border-primary/50',
                      ocupada && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="caja"
                        value={c.id}
                        checked={cajaId === c.id}
                        onChange={() => setCajaId(c.id)}
                        disabled={ocupada}
                        className="accent-primary"
                      />
                      <div>
                        <p className="font-medium">{c.nombre}</p>
                        {c.puntoExpedicion && (
                          <p className="text-xs text-muted-foreground">
                            Pto. exp. {c.puntoExpedicion.codigo}
                            {c.puntoExpedicion.descripcion && ` — ${c.puntoExpedicion.descripcion}`}
                          </p>
                        )}
                      </div>
                    </div>
                    {ocupada && c.sesionActiva && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        Ocupada por {c.sesionActiva.usuario.nombreCompleto}
                      </span>
                    )}
                  </label>
                );
              })}
              {cajasDisponibles.length === 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  No hay cajas disponibles en esta sucursal.
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Monto inicial (Gs.)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={montoInicial}
              onChange={(e) => setMontoInicial(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums"
              placeholder="100000"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Efectivo con el que se inaugura el turno (vuelto inicial).
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notas (opcional)
            </label>
            <input
              type="text"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              maxLength={500}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={abrir.isPending}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={abrir.isPending || !cajaId}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              {abrir.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Abrir caja
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
