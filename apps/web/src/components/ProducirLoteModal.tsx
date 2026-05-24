'use client';

import { Loader2, Save, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { type Subpreparacion, useProducirLote } from '@/hooks/useSubpreparaciones';
import { useSucursales } from '@/hooks/useSucursales';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

interface Props {
  subprep: Subpreparacion;
  onClose: () => void;
}

export function ProducirLoteModal({ subprep, onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const { data: sucursales = [] } = useSucursales();
  const producir = useProducirLote();

  const [sucursalId, setSucursalId] = useState(user?.sucursalActivaId ?? sucursales[0]?.id ?? '');
  const [cantidad, setCantidad] = useState('1');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);

  const espejo = subprep.receta?.productoInventarioEspejo;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sucursalId) return setError('Seleccioná una sucursal');
    const cant = Number.parseFloat(cantidad);
    if (Number.isNaN(cant) || cant <= 0) return setError('La cantidad debe ser mayor a 0');

    try {
      const r = await producir.mutateAsync({
        id: subprep.id,
        sucursalId,
        cantidad: cant,
        notas: notas.trim() || undefined,
      });
      toast.success(
        `Lote producido: ${r.produccion.cantidadProducida} ` +
          `(${r.produccion.insumosConsumidos} insumos descontados)`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al producir lote');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">Producir lote</h2>
            <p className="text-xs text-muted-foreground">{subprep.nombre}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
              <p className="font-medium">¿Qué hace producir un lote?</p>
              <p className="mt-1 leading-relaxed">
                Descuenta los insumos crudos de la receta del stock de la sucursal y suma{' '}
                <strong>{espejo?.nombre ?? 'el lote producido'}</strong> al inventario. Útil para
                registrar que la cocina ya preparó la sub-preparación de antemano.
              </p>
            </div>

            <Field label="Sucursal" required>
              <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
                <option value="">— Elegí sucursal —</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label={`Cantidad a producir${espejo ? ` (${espejo.unidadMedida.toLowerCase()})` : ''}`}
              required
              hint="Cuántas unidades del lote agregar al stock (no porciones por unidad — la cantidad final ya producida)."
            >
              <Input
                autoFocus
                type="number"
                step="0.001"
                min={0}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </Field>

            <Field label="Notas" hint="Opcional — turno, responsable, observaciones">
              <Textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                maxLength={500}
              />
            </Field>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t bg-muted/20 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={producir.isPending}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={producir.isPending}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {producir.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Producir lote
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
