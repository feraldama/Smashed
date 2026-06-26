'use client';

import { FileMinus, Loader2, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { type ItemComprobante, useEmitirNotaCredito } from '@/hooks/useComprobantes';
import { ApiError } from '@/lib/api';

interface Props {
  comprobanteId: string;
  numeroDocumento: string;
  items: ItemComprobante[];
  onClose: () => void;
  onEmitida?: (notaCreditoId: string) => void;
}

interface Seleccion {
  marcado: boolean;
  cantidad: number;
}

/**
 * Modal para emitir una nota de crédito parcial: el usuario elige qué items del
 * comprobante acreditar y en qué cantidad. Solo gerente/admin (el backend además
 * lo exige). El total se calcula prorrateando el subtotal de cada línea.
 */
export function NotaCreditoModal({
  comprobanteId,
  numeroDocumento,
  items,
  onClose,
  onEmitida,
}: Props) {
  const [sel, setSel] = useState<Record<string, Seleccion>>(() =>
    Object.fromEntries(items.map((it) => [it.id, { marcado: false, cantidad: it.cantidad }])),
  );
  const [motivo, setMotivo] = useState('');
  const [registrarEgresoCaja, setRegistrarEgresoCaja] = useState(true);
  const emitir = useEmitirNotaCredito(comprobanteId);

  function selDe(id: string, cantidadDefault: number): Seleccion {
    return sel[id] ?? { marcado: false, cantidad: cantidadDefault };
  }

  function toggle(id: string, cantidadDefault: number) {
    setSel((s) => {
      const cur = s[id] ?? { marcado: false, cantidad: cantidadDefault };
      return { ...s, [id]: { ...cur, marcado: !cur.marcado } };
    });
  }

  function setCantidad(it: ItemComprobante, valor: number) {
    const clamp = Math.max(1, Math.min(it.cantidad, Math.floor(valor) || 1));
    setSel((s) => {
      const cur = s[it.id] ?? { marcado: false, cantidad: it.cantidad };
      return { ...s, [it.id]: { ...cur, cantidad: clamp } };
    });
  }

  const seleccionados = items.filter((it) => selDe(it.id, it.cantidad).marcado);
  // Prorrateo del subtotal por la cantidad acreditada (mismo criterio que el backend).
  const totalNc = seleccionados.reduce((acc, it) => {
    const cantidad = selDe(it.id, it.cantidad).cantidad;
    const sub = BigInt(it.subtotal);
    const prorrateado = (sub * BigInt(cantidad)) / BigInt(it.cantidad);
    return acc + prorrateado;
  }, 0n);

  const motivoOk = motivo.trim().length >= 3;
  const puedeEmitir = seleccionados.length > 0 && motivoOk && !emitir.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!puedeEmitir) return;
    try {
      const res = await emitir.mutateAsync({
        items: seleccionados.map((it) => ({
          itemComprobanteId: it.id,
          cantidad: selDe(it.id, it.cantidad).cantidad,
        })),
        motivo: motivo.trim(),
        registrarEgresoCaja,
      });
      toast.success(`Nota de crédito ${res.comprobante.numeroDocumento} emitida`);
      onEmitida?.(res.comprobante.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al emitir la nota de crédito');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-1.5 font-bold">
            <FileMinus className="h-4 w-4 text-red-600" /> Nota de crédito
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
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <p>
                Elegí los ítems del comprobante <span className="font-mono">{numeroDocumento}</span>{' '}
                a acreditar. Se emite una nota de crédito por el total seleccionado. No se devuelve
                stock (la mercadería ya se entregó).
              </p>
            </div>

            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Ítem</th>
                    <th className="px-2 py-1.5 text-center">Facturado</th>
                    <th className="px-2 py-1.5 text-center">A acreditar</th>
                    <th className="px-2 py-1.5 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((it) => {
                    const s = selDe(it.id, it.cantidad);
                    return (
                      <tr key={it.id} className={s.marcado ? 'bg-primary/5' : undefined}>
                        <td className="px-2 py-1.5">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={s.marcado}
                              onChange={() => toggle(it.id, it.cantidad)}
                              className="h-4 w-4"
                            />
                            <span>{it.descripcion}</span>
                          </label>
                        </td>
                        <td className="px-2 py-1.5 text-center tabular-nums">{it.cantidad}</td>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            min={1}
                            max={it.cantidad}
                            value={s.cantidad}
                            disabled={!s.marcado}
                            onChange={(e) => setCantidad(it, Number(e.target.value))}
                            className="w-16 rounded-md border border-input bg-background px-2 py-1 text-center text-sm disabled:opacity-40"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {formatGs(
                            s.marcado
                              ? (BigInt(it.subtotal) * BigInt(s.cantidad)) / BigInt(it.cantidad)
                              : 0n,
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={registrarEgresoCaja}
                onChange={(e) => setRegistrarEgresoCaja(e.target.checked)}
                className="h-4 w-4"
              />
              Registrar la devolución como egreso en mi caja abierta
            </label>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Motivo<span className="ml-1 text-red-500">*</span>
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                maxLength={300}
                placeholder="Ej: Cliente devolvió un plato, ítem mal cargado, etc."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Total NC: </span>
              <span className="font-bold tabular-nums">{formatGs(totalNc)}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
                disabled={emitir.isPending}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!puedeEmitir}
                className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-red-700 disabled:opacity-50"
              >
                {emitir.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileMinus className="h-3.5 w-3.5" />
                )}
                Emitir nota de crédito
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatGs(n: bigint): string {
  return `Gs. ${n.toLocaleString('es-PY')}`;
}
