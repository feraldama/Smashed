'use client';

import { Loader2, Save, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { useAjustarStock } from '@/hooks/useInventario';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

interface AjusteStockModalProps {
  productoInventarioId: string;
  insumoNombre: string;
  unidad: string;
  stockActual: string;
  onClose: () => void;
}

const TIPOS = [
  { value: 'ENTRADA_AJUSTE', label: 'Entrada (ajuste +)', signo: '+' },
  { value: 'SALIDA_AJUSTE', label: 'Salida (ajuste −)', signo: '−' },
  { value: 'SALIDA_MERMA', label: 'Merma', signo: '−' },
  { value: 'SALIDA_CONSUMO_INTERNO', label: 'Consumo interno', signo: '−' },
] as const;

export function AjusteStockModal({
  productoInventarioId,
  insumoNombre,
  unidad,
  stockActual,
  onClose,
}: AjusteStockModalProps) {
  const ajustar = useAjustarStock();
  const user = useAuthStore((s) => s.user);
  const sucursales = user?.sucursales ?? [];

  const [sucursalId, setSucursalId] = useState(user?.sucursalActivaId ?? sucursales[0]?.id ?? '');
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]['value']>('ENTRADA_AJUSTE');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tipoActual = TIPOS.find((t) => t.value === tipo)!;
  const cantNum = Number.parseFloat(cantidad);
  const stockNum = Number(stockActual);
  const stockResultado = !Number.isNaN(cantNum)
    ? tipoActual.signo === '+'
      ? stockNum + cantNum
      : stockNum - cantNum
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sucursalId) return setError('Seleccioná una sucursal');
    if (Number.isNaN(cantNum) || cantNum <= 0) return setError('Cantidad inválida');
    if (motivo.trim().length < 3) return setError('Motivo requerido (mínimo 3 caracteres)');

    try {
      await ajustar.mutateAsync({
        productoInventarioId,
        sucursalId,
        tipo,
        cantidad: cantNum,
        motivo: motivo.trim(),
      });
      toast.success(`Stock ajustado: ${tipoActual.signo}${cantNum} ${unidad}`);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al ajustar');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Ajuste de stock</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="rounded-md bg-muted/40 p-3 text-sm">
            <p className="font-semibold">{insumoNombre}</p>
            <p className="text-xs text-muted-foreground">
              Stock actual:{' '}
              <span className="font-mono">
                {stockActual} {unidad}
              </span>
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Sucursal</label>
            <select
              value={sucursalId}
              onChange={(e) => setSucursalId(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Tipo de movimiento</label>
            <div className="mt-1 grid gap-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTipo(t.value)}
                  className={cn(
                    'flex items-center justify-between rounded-md border p-2 text-sm transition-colors',
                    tipo === t.value
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                      : 'border-input hover:bg-accent',
                  )}
                >
                  <span>{t.label}</span>
                  <span className={t.signo === '+' ? 'text-emerald-600' : 'text-destructive'}>
                    {t.signo}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Cantidad</label>
            <input
              type="number"
              step="0.001"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-lg"
              placeholder="100"
              autoFocus
            />
            {stockResultado !== null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Stock resultante:{' '}
                <span
                  className={cn(
                    'font-mono font-semibold',
                    stockResultado < 0 && 'text-destructive',
                  )}
                >
                  {stockResultado.toFixed(3)} {unidad}
                </span>
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Motivo <span className="text-destructive">*</span>
            </label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
              placeholder="Vencimiento, conteo físico, etc."
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={ajustar.isPending}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {ajustar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Aplicar ajuste
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
