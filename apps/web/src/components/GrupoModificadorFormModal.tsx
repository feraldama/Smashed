'use client';

import { Loader2, Save, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input, Select } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import {
  type ModificadorGrupo,
  type TipoModificadorGrupo,
  useActualizarGrupo,
  useCrearGrupo,
} from '@/hooks/useModificadores';
import { ApiError } from '@/lib/api';

interface Props {
  grupo?: ModificadorGrupo;
  onClose: () => void;
}

export function GrupoModificadorFormModal({ grupo, onClose }: Props) {
  const isEdit = Boolean(grupo);
  const crear = useCrearGrupo();
  const actualizar = useActualizarGrupo();
  const isPending = crear.isPending || actualizar.isPending;

  const [nombre, setNombre] = useState(grupo?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoModificadorGrupo>(grupo?.tipo ?? 'MULTIPLE');
  const [obligatorio, setObligatorio] = useState(grupo?.obligatorio ?? false);
  const [minSeleccion, setMinSeleccion] = useState(String(grupo?.minSeleccion ?? 0));
  const [maxSeleccion, setMaxSeleccion] = useState(
    grupo?.maxSeleccion != null ? String(grupo.maxSeleccion) : '',
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError('Nombre requerido');
    const minN = Number.parseInt(minSeleccion, 10);
    if (Number.isNaN(minN) || minN < 0) return setError('minSeleccion debe ser ≥ 0');
    const maxN = maxSeleccion.trim() ? Number.parseInt(maxSeleccion, 10) : null;
    if (maxN !== null && (Number.isNaN(maxN) || maxN < 1))
      return setError('maxSeleccion debe ser ≥ 1');
    if (maxN !== null && minN > maxN)
      return setError('minSeleccion no puede ser mayor a maxSeleccion');
    if (obligatorio && minN < 1) return setError('Si es obligatorio, minSeleccion debe ser ≥ 1');

    try {
      if (grupo) {
        await actualizar.mutateAsync({
          id: grupo.id,
          nombre: nombre.trim(),
          tipo,
          obligatorio,
          minSeleccion: minN,
          maxSeleccion: maxN,
        });
        toast.success('Grupo actualizado');
      } else {
        await crear.mutateAsync({
          nombre: nombre.trim(),
          tipo,
          obligatorio,
          minSeleccion: minN,
          maxSeleccion: maxN,
        });
        toast.success('Grupo creado');
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
          <h2 className="text-lg font-semibold">
            {isEdit ? 'Editar grupo de modificadores' : 'Nuevo grupo de modificadores'}
          </h2>
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
            <Field label="Nombre" required hint="ej: Punto de cocción, Sin..., Extras">
              <Input
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Punto de cocción"
                maxLength={150}
              />
            </Field>

            <Field
              label="Tipo"
              required
              hint="UNICA = elegir 1 (radio) · MULTIPLE = elegir varias (checkbox)"
            >
              <Select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoModificadorGrupo)}
              >
                <option value="MULTIPLE">MULTIPLE — checkbox</option>
                <option value="UNICA">UNICA — radio</option>
              </Select>
            </Field>

            <SwitchField
              label="Obligatorio"
              description="Si está activado, el cliente debe elegir al menos minSeleccion opciones"
              checked={obligatorio}
              onCheckedChange={setObligatorio}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Mín. selección" hint="0 = libre">
                <Input
                  type="number"
                  value={minSeleccion}
                  onChange={(e) => setMinSeleccion(e.target.value)}
                  min={0}
                  max={99}
                />
              </Field>
              <Field label="Máx. selección" hint="vacío = sin límite">
                <Input
                  type="number"
                  value={maxSeleccion}
                  onChange={(e) => setMaxSeleccion(e.target.value)}
                  min={1}
                  max={99}
                  placeholder="∞"
                />
              </Field>
            </div>

            {!isEdit && (
              <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Después de crear el grupo, vas a poder agregar las opciones desde la pantalla
                principal.
              </p>
            )}

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
