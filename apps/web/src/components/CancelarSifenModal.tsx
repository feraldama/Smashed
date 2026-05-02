'use client';

import { Loader2, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { useCancelarSifen } from '@/hooks/useComprobantes';
import { ApiError } from '@/lib/api';

interface Props {
  comprobanteId: string;
  numeroDocumento: string;
  onClose: () => void;
}

export function CancelarSifenModal({ comprobanteId, numeroDocumento, onClose }: Props) {
  const [motivo, setMotivo] = useState('');
  const cancelar = useCancelarSifen();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (motivo.trim().length < 5) {
      toast.error('Motivo debe tener al menos 5 caracteres');
      return;
    }
    try {
      const res = await cancelar.mutateAsync({ id: comprobanteId, motivo: motivo.trim() });
      if (res.aprobado) {
        toast.success('Cancelación aceptada por SIFEN');
      } else {
        toast.error(`SIFEN rechazó la cancelación: ${res.mensaje}`);
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al cancelar');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-bold">Cancelar comprobante en SIFEN</h2>
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
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <strong>Atención:</strong> el comprobante{' '}
            <span className="font-mono">{numeroDocumento}</span> quedará anulado en SIFEN y
            localmente. Esta operación es irreversible (DNIT permite cancelar dentro de las 48 hs
            hábiles desde la emisión).
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Motivo de cancelación
              <span className="ml-1 text-red-500">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Describí brevemente por qué se cancela (mínimo 5 caracteres)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{motivo.length}/500 caracteres</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
              disabled={cancelar.isPending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={cancelar.isPending || motivo.trim().length < 5}
              className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-red-700 disabled:opacity-50"
            >
              {cancelar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirmar cancelación
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
