'use client';

import { Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input, Select } from '@/components/ui/Input';
import {
  type Insumo,
  type UnidadMedida,
  useActualizarInsumo,
  useCrearInsumo,
} from '@/hooks/useInventario';
import { useProveedores } from '@/hooks/useProveedores';
import { ApiError } from '@/lib/api';
import { etiquetaUnidad, familiaUnidad, TODAS_UNIDADES } from '@/lib/unidades';
import { formatGs } from '@/lib/utils';

const UNIDADES = TODAS_UNIDADES;

interface FilaEquivalencia {
  localId: string;
  unidad: UnidadMedida;
  cantidadUnidad: string;
  cantidadBase: string;
}

let equivSeq = 0;
const nuevoLocalId = () => `eq_${++equivSeq}`;

interface InsumoFormModalProps {
  insumo?: Insumo;
  onClose: () => void;
}

export function InsumoFormModal({ insumo, onClose }: InsumoFormModalProps) {
  const crear = useCrearInsumo();
  const actualizar = useActualizarInsumo();
  const { data: proveedores = [] } = useProveedores();
  const isPending = crear.isPending || actualizar.isPending;

  const [codigo, setCodigo] = useState(insumo?.codigo ?? '');
  const [codigoBarras, setCodigoBarras] = useState(insumo?.codigoBarras ?? '');
  const [nombre, setNombre] = useState(insumo?.nombre ?? '');
  const [unidadMedida, setUnidadMedida] = useState<UnidadMedida>(insumo?.unidadMedida ?? 'UNIDAD');
  const [costoUnitario, setCostoUnitario] = useState(insumo ? String(insumo.costoUnitario) : '');
  const [categoria, setCategoria] = useState(insumo?.categoria ?? '');
  const [proveedorId, setProveedorId] = useState(insumo?.proveedor?.id ?? '');
  const [equivalencias, setEquivalencias] = useState<FilaEquivalencia[]>(
    () =>
      insumo?.unidadesAlternativas?.map((u) => ({
        localId: nuevoLocalId(),
        unidad: u.unidad,
        cantidadUnidad: String(u.cantidadUnidad),
        cantidadBase: String(u.cantidadBase),
      })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  // Una equivalencia solo tiene sentido cruzando familias distintas a la de la
  // unidad de stock (dentro de la misma familia la conversión ya es automática).
  const familiaBase = familiaUnidad(unidadMedida);
  const unidadesParaEquiv = UNIDADES.filter((u) => familiaUnidad(u) !== familiaBase);

  function agregarEquivalencia() {
    const primera = unidadesParaEquiv[0];
    if (!primera) return;
    setEquivalencias((prev) => [
      ...prev,
      { localId: nuevoLocalId(), unidad: primera, cantidadUnidad: '', cantidadBase: '1' },
    ]);
  }

  function actualizarEquivalencia(localId: string, patch: Partial<FilaEquivalencia>) {
    setEquivalencias((prev) => prev.map((f) => (f.localId === localId ? { ...f, ...patch } : f)));
  }

  function eliminarEquivalencia(localId: string) {
    setEquivalencias((prev) => prev.filter((f) => f.localId !== localId));
  }

  const costoNum = Number.parseInt(costoUnitario.replace(/[^\d]/g, ''), 10);
  const costoValido = !Number.isNaN(costoNum) && costoUnitario;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError('Nombre requerido');
    const costoFinal = Number.isNaN(costoNum) ? 0 : costoNum;

    // Validar + mapear equivalencias.
    const familiasUsadas = new Set<string>();
    const unidadesAlternativas: Array<{
      unidad: UnidadMedida;
      cantidadUnidad: number;
      cantidadBase: number;
    }> = [];
    for (const [i, f] of equivalencias.entries()) {
      const cu = Number.parseFloat(f.cantidadUnidad);
      const cb = Number.parseFloat(f.cantidadBase);
      if (!(cu > 0) || !(cb > 0)) {
        return setError(`Equivalencia ${i + 1}: las cantidades deben ser mayores a 0`);
      }
      const fam = familiaUnidad(f.unidad);
      if (familiasUsadas.has(fam)) {
        return setError(`Equivalencia ${i + 1}: ya hay otra equivalencia de ${fam.toLowerCase()}`);
      }
      familiasUsadas.add(fam);
      unidadesAlternativas.push({ unidad: f.unidad, cantidadUnidad: cu, cantidadBase: cb });
    }

    const body = {
      codigo: codigo.trim() || undefined,
      codigoBarras: codigoBarras.trim() || undefined,
      nombre: nombre.trim(),
      unidadMedida,
      costoUnitario: costoFinal,
      categoria: categoria.trim() || undefined,
      proveedorId: proveedorId || undefined,
      unidadesAlternativas,
    };

    try {
      if (insumo) {
        await actualizar.mutateAsync({ id: insumo.id, ...body });
        toast.success('Insumo actualizado');
      } else {
        await crear.mutateAsync(body);
        toast.success('Insumo creado');
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
        className="w-full max-w-2xl overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">{insumo ? 'Editar insumo' : 'Nuevo insumo'}</h2>
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
          className="space-y-4 p-5"
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <Field label="Nombre" required>
              <Input
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Pan de hamburguesa"
              />
            </Field>
            <Field label="Código">
              <Input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="font-mono"
                placeholder="PAN-001"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Unidad de medida">
              <Select
                value={unidadMedida}
                onChange={(e) => setUnidadMedida(e.target.value as UnidadMedida)}
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Costo unitario" hint={costoValido ? formatGs(costoNum) : undefined}>
              <Input
                type="text"
                inputMode="numeric"
                value={costoUnitario}
                onChange={(e) => setCostoUnitario(e.target.value)}
                className="font-mono"
                placeholder="2000"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Categoría libre">
              <Input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Carnes / Lácteos / Vegetales..."
              />
            </Field>
            <Field label="Proveedor">
              <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                <option value="">— Sin proveedor —</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.razonSocial}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Código de barras">
            <Input
              value={codigoBarras}
              onChange={(e) => setCodigoBarras(e.target.value)}
              className="font-mono"
              placeholder="7790895001234"
            />
          </Field>

          {/* Equivalencias de unidad — para usar el insumo en recetas con otra
              familia de unidad (ej: stock en unidades, receta en gramos). */}
          <div className="rounded-md border border-dashed border-input p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Equivalencias de unidad
              </p>
              <button
                type="button"
                onClick={agregarEquivalencia}
                disabled={unidadesParaEquiv.length === 0}
                className="flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar
              </button>
            </div>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Solo si querés usar este insumo en recetas con otro tipo de unidad que{' '}
              <span className="font-medium">{etiquetaUnidad(unidadMedida).toLowerCase()}</span>. Ej:
              stock en unidades pero la receta lo mide en gramos → “150 gramo = 1 unidad”.
            </p>

            {equivalencias.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin equivalencias.</p>
            ) : (
              <div className="space-y-2">
                {equivalencias.map((f) => (
                  <div key={f.localId} className="flex flex-wrap items-center gap-2 text-xs">
                    <Input
                      type="number"
                      step="0.000001"
                      min="0"
                      value={f.cantidadUnidad}
                      onChange={(e) =>
                        actualizarEquivalencia(f.localId, { cantidadUnidad: e.target.value })
                      }
                      className="w-20 px-2 py-1 text-right font-mono"
                      placeholder="150"
                    />
                    <Select
                      value={f.unidad}
                      onChange={(e) =>
                        actualizarEquivalencia(f.localId, {
                          unidad: e.target.value as UnidadMedida,
                        })
                      }
                      className="w-32 px-2 py-1"
                    >
                      {unidadesParaEquiv.map((u) => (
                        <option key={u} value={u}>
                          {etiquetaUnidad(u)}
                        </option>
                      ))}
                    </Select>
                    <span className="text-muted-foreground">=</span>
                    <Input
                      type="number"
                      step="0.000001"
                      min="0"
                      value={f.cantidadBase}
                      onChange={(e) =>
                        actualizarEquivalencia(f.localId, { cantidadBase: e.target.value })
                      }
                      className="w-20 px-2 py-1 text-right font-mono"
                      placeholder="1"
                    />
                    <span className="text-muted-foreground">
                      {etiquetaUnidad(unidadMedida).toLowerCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() => eliminarEquivalencia(f.localId)}
                      className="ml-auto rounded-md p-1 text-destructive hover:bg-destructive/10"
                      aria-label="Eliminar equivalencia"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
              className="rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
