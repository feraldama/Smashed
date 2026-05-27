'use client';

import { Loader2, Save, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input, Select } from '@/components/ui/Input';
import { Switch, SwitchField } from '@/components/ui/Switch';
import { useProductos } from '@/hooks/useCatalogo';
import { useInsumos } from '@/hooks/useInventario';
import {
  type ModificadorOpcion,
  useActualizarOpcion,
  useCrearOpcion,
} from '@/hooks/useModificadores';
import { ApiError } from '@/lib/api';
import { formatGs } from '@/lib/utils';

interface Props {
  grupoId: string;
  opcion?: ModificadorOpcion;
  onClose: () => void;
}

export function OpcionModificadorFormModal({ grupoId, opcion, onClose }: Props) {
  const isEdit = Boolean(opcion);
  const crear = useCrearOpcion(grupoId);
  const actualizar = useActualizarOpcion(grupoId);
  const isPending = crear.isPending || actualizar.isPending;

  const [nombre, setNombre] = useState(opcion?.nombre ?? '');
  const [precioExtra, setPrecioExtra] = useState(opcion ? String(opcion.precioExtra) : '0');
  const [orden, setOrden] = useState(String(opcion?.orden ?? 0));
  const [activo, setActivo] = useState(opcion?.activo ?? true);
  // Vínculo de stock codificado: '' (ninguno), `pv:<id>` (producto) o
  // `pi:<id>` (insumo). Unifica los dos campos backend en un solo Select.
  const [vinculo, setVinculo] = useState<string>(
    opcion?.productoVentaId
      ? `pv:${opcion.productoVentaId}`
      : opcion?.productoInventarioId
        ? `pi:${opcion.productoInventarioId}`
        : '',
  );
  const [cantidadInventario, setCantidadInventario] = useState<string>(
    opcion?.cantidadInventario ?? '',
  );
  const [soloSubprep, setSoloSubprep] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Incluir no-vendibles (las sub-preparaciones se excluyen del listado default).
  const { data: productos = [], isLoading: loadingProductos } = useProductos({
    incluirNoVendibles: true,
  });
  const { data: insumosData, isLoading: loadingInsumos } = useInsumos();
  const insumos = insumosData?.insumos ?? [];

  const tipoVinculo = vinculo.startsWith('pi:')
    ? 'insumo'
    : vinculo.startsWith('pv:')
      ? 'producto'
      : 'none';
  const insumoSel =
    tipoVinculo === 'insumo' ? insumos.find((i) => i.id === vinculo.slice(3)) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError('Nombre requerido');
    const precio = Number.parseInt(precioExtra, 10);
    if (Number.isNaN(precio) || precio < 0) return setError('Precio extra debe ser ≥ 0');
    const ord = Number.parseInt(orden, 10);
    if (Number.isNaN(ord) || ord < 0) return setError('Orden debe ser ≥ 0');

    // Desarmar el vínculo codificado en los campos del backend (XOR). Siempre
    // mandamos los tres para que el update limpie el lado no usado.
    let productoVentaId: string | null = null;
    let productoInventarioId: string | null = null;
    let cantidadInv: number | null = null;
    if (vinculo.startsWith('pv:')) {
      productoVentaId = vinculo.slice(3);
    } else if (vinculo.startsWith('pi:')) {
      productoInventarioId = vinculo.slice(3);
      cantidadInv = Number(cantidadInventario.replace(',', '.'));
      if (!Number.isFinite(cantidadInv) || cantidadInv <= 0) {
        return setError('Indicá la cantidad de insumo a descontar (> 0)');
      }
    }

    try {
      const vinculoPayload = {
        productoVentaId,
        productoInventarioId,
        cantidadInventario: cantidadInv,
      };
      if (opcion) {
        await actualizar.mutateAsync({
          opcionId: opcion.id,
          nombre: nombre.trim(),
          precioExtra: precio,
          orden: ord,
          activo,
          ...vinculoPayload,
        });
        toast.success('Opción actualizada');
      } else {
        await crear.mutateAsync({
          nombre: nombre.trim(),
          precioExtra: precio,
          orden: ord,
          activo,
          ...vinculoPayload,
        });
        toast.success('Opción creada');
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar');
    }
  }

  const precioPreview = Number.parseInt(precioExtra, 10);

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
          <h2 className="text-lg font-semibold">{isEdit ? 'Editar opción' : 'Nueva opción'}</h2>
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
            <Field label="Nombre" required hint="ej: Jugoso, Sin cebolla, + Queso cheddar">
              <Input
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Jugoso"
                maxLength={150}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Precio extra (Gs.)"
                hint={
                  precioPreview > 0
                    ? `Se sumará ${formatGs(precioPreview)} al producto`
                    : '0 = no afecta el precio'
                }
              >
                <Input
                  type="number"
                  value={precioExtra}
                  onChange={(e) => setPrecioExtra(e.target.value)}
                  min={0}
                />
              </Field>
              <Field label="Orden" hint="Cuanto menor, antes aparece">
                <Input
                  type="number"
                  value={orden}
                  onChange={(e) => setOrden(e.target.value)}
                  min={0}
                  max={9999}
                />
              </Field>
            </div>

            <SwitchField
              label="Activa"
              description="Si está desactivada, no aparece en el POS pero queda en histórico"
              checked={activo}
              onCheckedChange={setActivo}
            />

            <div className="rounded-md border bg-muted/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Stock al vender
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Solo sub-preparaciones</span>
                  <Switch
                    size="sm"
                    checked={soloSubprep}
                    onCheckedChange={setSoloSubprep}
                    aria-label="Filtrar solo sub-preparaciones"
                  />
                </div>
              </div>
              <Field
                label="Vincular a"
                hint={
                  tipoVinculo === 'none'
                    ? 'Sin vínculo: la opción no descuenta stock (ej: "sin sal", "extra picante").'
                    : tipoVinculo === 'insumo'
                      ? 'Descuenta el insumo directo: cantidad indicada × cantidad del ítem vendido.'
                      : 'Descuenta según la receta del producto vinculado, multiplicada por la cantidad del ítem.'
                }
              >
                <Select
                  value={vinculo}
                  onChange={(e) => setVinculo(e.target.value)}
                  disabled={loadingProductos || loadingInsumos}
                >
                  <option value="">— Sin descuento de stock —</option>
                  {insumos.length > 0 && (
                    <optgroup label="Insumos">
                      {insumos.map((i) => (
                        <option key={i.id} value={`pi:${i.id}`}>
                          📦 {i.nombre}
                          {i.codigo ? ` (${i.codigo})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Sub-preparaciones / Productos">
                    {productos
                      .filter((p) => (soloSubprep ? p.esPreparacion : true))
                      .map((p) => (
                        <option key={p.id} value={`pv:${p.id}`}>
                          {p.esPreparacion ? '🧪 ' : ''}
                          {p.nombre}
                          {p.codigo ? ` (${p.codigo})` : ''}
                        </option>
                      ))}
                  </optgroup>
                </Select>
              </Field>
              {tipoVinculo === 'insumo' && (
                <div className="mt-3">
                  <Field
                    label="Cantidad a descontar"
                    hint={
                      insumoSel
                        ? `En ${insumoSel.unidadMedida.toLowerCase()} (unidad del insumo), por ítem vendido`
                        : 'Cantidad del insumo por ítem vendido'
                    }
                  >
                    <Input
                      type="number"
                      value={cantidadInventario}
                      onChange={(e) => setCantidadInventario(e.target.value)}
                      min={0}
                      step="0.001"
                      placeholder="1"
                    />
                  </Field>
                </div>
              )}
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
