'use client';

import { Loader2, Save, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input } from '@/components/ui/Input';
import { useActualizarZona, useCrearZona, type ZonaMesa } from '@/hooks/useMesas';
import { ApiError } from '@/lib/api';

interface Props {
  zona?: ZonaMesa;
  sucursalId: string | null;
  onClose: () => void;
}

export function ZonaFormModal({ zona, sucursalId, onClose }: Props) {
  const isEdit = Boolean(zona);
  const crear = useCrearZona();
  const actualizar = useActualizarZona();
  const isPending = crear.isPending || actualizar.isPending;

  const [nombre, setNombre] = useState(zona?.nombre ?? '');
  const [orden, setOrden] = useState<string>(String(zona?.orden ?? 0));
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError('Nombre requerido');
    const ordenNum = Number.parseInt(orden, 10);
    if (Number.isNaN(ordenNum) || ordenNum < 0) return setError('Orden debe ser un número ≥ 0');

    try {
      if (zona) {
        await actualizar.mutateAsync({
          id: zona.id,
          nombre: nombre.trim(),
          orden: ordenNum,
        });
        toast.success('Zona actualizada');
      } else {
        if (!sucursalId) return setError('Seleccioná una sucursal antes de crear zonas');
        await crear.mutateAsync({
          sucursalId,
          nombre: nombre.trim(),
          orden: ordenNum,
        });
        toast.success('Zona creada');
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar');
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
          <h2 className="text-lg font-semibold">{isEdit ? 'Editar zona' : 'Nueva zona'}</h2>
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
            <Field label="Nombre" required hint="ej: Salón Principal, Terraza, Patio">
              <Input
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Salón Principal"
                maxLength={80}
              />
            </Field>

            <Field label="Orden" hint="Cuanto menor, más arriba aparece en el listado">
              <Input
                type="number"
                value={orden}
                onChange={(e) => setOrden(e.target.value)}
                min={0}
                max={9999}
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
