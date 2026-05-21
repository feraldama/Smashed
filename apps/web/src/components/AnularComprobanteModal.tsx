'use client';

import { Ban, Loader2, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { useAnularComprobante } from '@/hooks/useComprobantes';
import { ApiError } from '@/lib/api';

interface Props {
  comprobanteId: string;
  numeroDocumento: string;
  /** Si true, mostramos un cartelito explicando que el comprobante también
   *  está aprobado en SIFEN — anular acá NO comunica la cancelación a SIFEN
   *  (eso lo hace "Cancelar en SIFEN" aparte). */
  aprobadoEnSifen?: boolean;
  onClose: () => void;
  onAnulado?: () => void;
}

export function AnularComprobanteModal({
  comprobanteId,
  numeroDocumento,
  aprobadoEnSifen,
  onClose,
  onAnulado,
}: Props) {
  const [motivo, setMotivo] = useState('');
  const anular = useAnularComprobante(comprobanteId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const m = motivo.trim();
    if (m.length < 3) {
      toast.error('El motivo debe tener al menos 3 caracteres');
      return;
    }
    try {
      await anular.mutateAsync({ motivo: m });
      toast.success(`Comprobante ${numeroDocumento} anulado`);
      onAnulado?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al anular');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-1.5 font-bold">
            <Ban className="h-4 w-4 text-red-600" /> Anular comprobante
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
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4 p-4"
        >
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <p>
              El comprobante <span className="font-mono">{numeroDocumento}</span> quedará{' '}
              <strong>ANULADO</strong>. Si la caja todavía está abierta se revierten los movimientos
              y, si el pedido no fue entregado, se cancela y libera el stock.
            </p>
          </div>

          {aprobadoEnSifen && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-200">
              <strong>Atención:</strong> este comprobante ya fue aprobado por SIFEN. Esta acción
              solo lo anula localmente — para cancelarlo en SIFEN usá el botón &quot;Cancelar en
              SIFEN&quot;.
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Motivo de la anulación
              <span className="ml-1 text-red-500">*</span>
            </label>
            <textarea
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Ej: Error en el pedido, descuento mal aplicado, etc."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{motivo.length}/300 caracteres</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
              disabled={anular.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={anular.isPending || motivo.trim().length < 3}
              className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-red-700 disabled:opacity-50"
            >
              {anular.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Ban className="h-3.5 w-3.5" />
              )}
              Anular comprobante
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
