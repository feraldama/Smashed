'use client';

import { ArrowDownCircle, ArrowUpCircle, Loader2, Wallet, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { type MovimientoInput, useRegistrarMovimiento } from '@/hooks/useCaja';
import { useKeyboardInput } from '@/hooks/useKeyboardInput';
import { useNumpadInput } from '@/hooks/useNumpadInput';
import { ApiError } from '@/lib/api';
import { cn, formatGs } from '@/lib/utils';

type TipoMov = MovimientoInput['tipo'];

const TIPOS: Array<{ tipo: TipoMov; label: string; hint: string; salida: boolean }> = [
  {
    tipo: 'RETIRO_PARCIAL',
    label: 'Retiro / Sangría',
    hint: 'Efectivo que sacás de la caja (a caja fuerte, depósito).',
    salida: true,
  },
  {
    tipo: 'EGRESO',
    label: 'Egreso / Gasto',
    hint: 'Pago de un gasto en efectivo desde la caja (delivery, feria, etc.).',
    salida: true,
  },
  {
    tipo: 'INGRESO_EXTRA',
    label: 'Ingreso extra',
    hint: 'Efectivo que entra a la caja fuera de una venta (vuelto adicional).',
    salida: false,
  },
];

interface Props {
  aperturaId: string;
  onClose: () => void;
}

export function MovimientoCajaModal({ aperturaId, onClose }: Props) {
  const [tipo, setTipo] = useState<TipoMov>('RETIRO_PARCIAL');
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');

  const registrar = useRegistrarMovimiento();
  // Sólo INGRESO_EXTRA suma a la caja; los otros dos restan.
  const esSalida = tipo !== 'INGRESO_EXTRA';

  const montoNp = useNumpadInput({
    value: monto,
    onChange: (v) => setMonto(v.replace(/\D/g, '')),
    label: 'Monto (Gs.)',
    formatPreview: (raw) => {
      const n = Number.parseInt(raw.replace(/\D/g, ''), 10);
      return Number.isNaN(n) ? '0' : formatGs(n);
    },
    maxLength: 12,
  });
  const conceptoKb = useKeyboardInput({
    value: concepto,
    onChange: setConcepto,
    label: 'Concepto',
    maxLength: 200,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const montoNum = Number.parseInt(monto.replace(/\D/g, ''), 10);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      toast.error('Ingresá un monto mayor a 0');
      return;
    }
    if (!concepto.trim()) {
      toast.error('El concepto es obligatorio');
      return;
    }
    try {
      await registrar.mutateAsync({ aperturaId, tipo, monto: montoNum, concepto: concepto.trim() });
      toast.success('Movimiento registrado');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al registrar el movimiento');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold">
            <Wallet className="h-4 w-4" /> Movimiento de caja
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
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tipo de movimiento
            </span>
            <div className="space-y-2">
              {TIPOS.map((t) => (
                <label
                  key={t.tipo}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm',
                    tipo === t.tipo
                      ? 'border-primary bg-primary/5'
                      : 'border-input hover:border-primary/50',
                  )}
                >
                  <input
                    type="radio"
                    name="tipoMov"
                    value={t.tipo}
                    checked={tipo === t.tipo}
                    onChange={() => setTipo(t.tipo)}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <p className="flex items-center gap-1 font-medium">
                      {t.salida ? (
                        <ArrowDownCircle className="h-3.5 w-3.5 text-red-600" />
                      ) : (
                        <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-600" />
                      )}
                      {t.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{t.hint}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Monto (Gs.)
            </label>
            <input
              type="text"
              value={monto}
              onChange={(e) => setMonto(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums"
              placeholder="50000"
              {...montoNp.inputProps}
            />
            <p
              className={cn(
                'mt-1 text-[11px]',
                esSalida ? 'text-red-600 dark:text-red-300' : 'text-emerald-600',
              )}
            >
              {esSalida ? 'Sale de la caja (resta del esperado)' : 'Entra a la caja'}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Concepto
            </label>
            <input
              type="text"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              maxLength={200}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Ej: retiro a caja fuerte, pago a delivery..."
              {...conceptoKb.inputProps}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={registrar.isPending}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={registrar.isPending}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              {registrar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Registrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
