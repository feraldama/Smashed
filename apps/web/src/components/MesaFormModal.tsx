'use client';

import { Loader2, Save, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input, Select } from '@/components/ui/Input';
import { type Mesa, useActualizarMesa, useCrearMesa, type ZonaMesa } from '@/hooks/useMesas';
import { ApiError } from '@/lib/api';

interface Props {
  /** Mesa existente para edición */
  mesa?: Mesa;
  /** Zona a la que pertenece la mesa (en edición es la zona actual) */
  zonaActualId: string;
  /** Listado de zonas disponibles (para selector cuando se mueve de zona) */
  zonas: ZonaMesa[];
  onClose: () => void;
}

export function MesaFormModal({ mesa, zonaActualId, zonas, onClose }: Props) {
  const isEdit = Boolean(mesa);
  const crear = useCrearMesa();
  const actualizar = useActualizarMesa();
  const isPending = crear.isPending || actualizar.isPending;

  const [zonaId, setZonaId] = useState(zonaActualId);
  const [numero, setNumero] = useState<string>(String(mesa?.numero ?? ''));
  const [capacidad, setCapacidad] = useState<string>(String(mesa?.capacidad ?? 4));
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const numNum = Number.parseInt(numero, 10);
    if (Number.isNaN(numNum) || numNum < 1) return setError('Número de mesa requerido (≥ 1)');
    const capNum = Number.parseInt(capacidad, 10);
    if (Number.isNaN(capNum) || capNum < 1) return setError('Capacidad debe ser ≥ 1');

    try {
      if (mesa) {
        await actualizar.mutateAsync({
          id: mesa.id,
          zonaMesaId: zonaId !== zonaActualId ? zonaId : undefined,
          numero: numNum,
          capacidad: capNum,
        });
        toast.success('Mesa actualizada');
      } else {
        await crear.mutateAsync({
          zonaMesaId: zonaId,
          numero: numNum,
          capacidad: capNum,
        });
        toast.success('Mesa creada');
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar');
    }
  }

  // Zonas disponibles para el selector — cuando se mueve, sólo dentro de la misma sucursal
  const sucursalDeZonaActual = zonas.find((z) => z.id === zonaActualId)?.sucursalId;
  const zonasDisponibles = zonas.filter((z) => z.sucursalId === sucursalDeZonaActual);

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
          <h2 className="text-lg font-semibold">{isEdit ? 'Editar mesa' : 'Nueva mesa'}</h2>
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
            <Field label="Zona" required>
              <Select value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
                {zonasDisponibles.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nombre}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Número" required hint="Único por zona">
                <Input
                  autoFocus
                  type="number"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  min={1}
                  max={9999}
                />
              </Field>
              <Field label="Capacidad" required hint="Personas">
                <Input
                  type="number"
                  value={capacidad}
                  onChange={(e) => setCapacidad(e.target.value)}
                  min={1}
                  max={99}
                />
              </Field>
            </div>

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
              disabled={isPending}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
