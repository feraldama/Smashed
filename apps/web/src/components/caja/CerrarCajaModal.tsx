'use client';

import { Calculator, Loader2, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { confirmar, toast } from '@/components/Toast';
import {
  type AperturaDetalle,
  DENOMINACIONES_PYG,
  totalConteo,
  useCerrarCaja,
} from '@/hooks/useCaja';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  apertura: AperturaDetalle;
  /** Si true, el cajero ve sólo el conteo y el total contado — sin esperado,
   * sin diferencia ni desglose por método. La idea es que cuente a ciegas y
   * el ticket Z post-cierre revele la verdad. Para admin/gerente, se muestra
   * todo (modo "supervisión"). */
  modoCajero: boolean;
  /** Llamado tras un cierre exitoso, con el id del cierre. El padre decide
   * si abre el ticket Z, redirige, etc. */
  onCierreExitoso: (cierreId: string) => void;
  onClose: () => void;
}

export function CerrarCajaModal({ apertura, modoCajero, onCierreExitoso, onClose }: Props) {
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const [notas, setNotas] = useState('');

  const cerrar = useCerrarCaja();

  const totalContado = useMemo(() => totalConteo(conteo), [conteo]);
  const totalEsperado = Number(apertura.totales.totalEsperadoEfectivo);
  const diferencia = totalContado - totalEsperado;

  function setDenom(denom: number, cantidad: number) {
    setConteo((prev) => ({ ...prev, [String(denom)]: Math.max(0, cantidad) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (totalContado === 0) {
      const ok = await confirmar({
        titulo: 'Cierre con efectivo en 0',
        mensaje: '¿Cerrar la caja con efectivo contado en 0?',
        icon: 'warning',
        textoConfirmar: 'Cerrar igual',
      });
      if (!ok) return;
    }

    // Sólo en modo supervisión advertimos por diferencia. El cajero no la ve
    // en pantalla, así que sería raro pedirle nota antes de cerrar.
    if (!modoCajero && Math.abs(diferencia) > 0 && !notas.trim()) {
      const ok = await confirmar({
        titulo: 'Cierre con diferencia',
        mensaje: `Diferencia de Gs. ${diferencia.toLocaleString('es-PY')}. ¿Cerrar sin nota?`,
        icon: 'warning',
        textoConfirmar: 'Cerrar sin nota',
      });
      if (!ok) return;
    }

    try {
      const conteoLimpio = Object.fromEntries(
        Object.entries(conteo).filter(([, cant]) => cant > 0),
      );
      const res = await cerrar.mutateAsync({
        aperturaId: apertura.id,
        totalContadoEfectivo: totalContado,
        conteoEfectivo: Object.keys(conteoLimpio).length > 0 ? conteoLimpio : undefined,
        notas: notas.trim() || undefined,
      });
      toast.success('Caja cerrada — generando ticket Z…');
      onCierreExitoso(res.cierre.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al cerrar caja');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold">
            <Calculator className="h-4 w-4" /> Cerrar caja Z
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
          className="max-h-[calc(90vh-130px)] space-y-4 overflow-y-auto p-4"
        >
          {/* Resumen — sólo monto inicial para el cajero. Los demás totales
              aparecen únicamente para admin/gerente (modo supervisión). */}
          <section
            className={cn(
              'grid gap-3 rounded-md border bg-muted/30 p-3 text-sm',
              modoCajero ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3',
            )}
          >
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Monto inicial
              </p>
              <p className="font-semibold tabular-nums">{formatGs(apertura.montoInicial)}</p>
            </div>
            {!modoCajero && (
              <>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Total ventas
                  </p>
                  <p className="font-semibold tabular-nums">
                    {formatGs(apertura.totales.totalVentas)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Esperado en efectivo
                  </p>
                  <p className="text-base font-bold tabular-nums">
                    {formatGs(apertura.totales.totalEsperadoEfectivo)}
                  </p>
                </div>
              </>
            )}
          </section>

          {/* Desglose por método — sólo supervisión */}
          {!modoCajero && Object.keys(apertura.totales.totalesPorMetodo).length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Ventas por método
              </h3>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-2 text-sm md:grid-cols-3">
                {Object.entries(apertura.totales.totalesPorMetodo).map(([metodo, monto]) => (
                  <div key={metodo} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{labelMetodo(metodo)}</span>
                    <span className="font-semibold tabular-nums">{formatGs(monto)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Conteo por denominación — siempre visible */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Conteo de efectivo por denominación
            </h3>
            {modoCajero && (
              <p className="mb-2 text-[11px] text-muted-foreground">
                Contá el efectivo en caja y cargá la cantidad de cada denominación. Al confirmar vas
                a recibir el ticket Z con el resultado.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {DENOMINACIONES_PYG.map((d) => {
                const cant = conteo[String(d)] ?? 0;
                const subtotal = d * cant;
                return (
                  <div
                    key={d}
                    className="flex items-center justify-between gap-2 rounded-md border p-2"
                  >
                    <span className="w-20 text-sm font-semibold tabular-nums">
                      Gs. {d.toLocaleString('es-PY')}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={cant === 0 ? '' : cant}
                      onChange={(e) => setDenom(d, parseInt(e.target.value || '0', 10))}
                      className="w-16 rounded-md border border-input bg-background px-2 py-1 text-center text-sm tabular-nums"
                      placeholder="0"
                    />
                    <span className="flex-1 text-right text-xs tabular-nums text-muted-foreground">
                      {subtotal > 0 ? `= ${subtotal.toLocaleString('es-PY')}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Total contado + (sólo supervisión) diferencia */}
          {modoCajero ? (
            <section className="rounded-md border-2 border-primary bg-primary/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Total contado
              </p>
              <p className="text-2xl font-bold tabular-nums">
                Gs. {totalContado.toLocaleString('es-PY')}
              </p>
            </section>
          ) : (
            <section
              className={cn(
                'rounded-md border-2 p-3',
                diferencia === 0
                  ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30'
                  : diferencia > 0
                    ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30'
                    : 'border-red-300 bg-red-50 dark:bg-red-950/30',
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Total contado
                  </p>
                  <p className="text-xl font-bold tabular-nums">
                    Gs. {totalContado.toLocaleString('es-PY')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Diferencia
                  </p>
                  <p
                    className={cn(
                      'text-xl font-bold tabular-nums',
                      diferencia === 0
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : diferencia > 0
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-red-700 dark:text-red-300',
                    )}
                  >
                    {diferencia >= 0 ? '+' : ''}
                    Gs. {diferencia.toLocaleString('es-PY')}
                  </p>
                  {diferencia !== 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {diferencia > 0 ? 'Sobrante' : 'Faltante'}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Notas — sólo supervisión, el cajero no debe agregar nota porque
              tampoco ve la diferencia que justificaría la nota. */}
          {!modoCajero && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notas / observaciones {diferencia !== 0 && '(recomendado)'}
              </label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder={
                  diferencia !== 0 ? 'Justificá la diferencia (ej: vuelto al cliente)' : 'Opcional'
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
        </form>

        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={cerrar.isPending}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={(e) => {
              void handleSubmit(e);
            }}
            disabled={cerrar.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
          >
            {cerrar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirmar cierre Z
          </button>
        </div>
      </div>
    </div>
  );
}

function labelMetodo(m: string): string {
  return m
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatGs(n: string | bigint | number): string {
  return `Gs. ${BigInt(n).toLocaleString('es-PY')}`;
}
