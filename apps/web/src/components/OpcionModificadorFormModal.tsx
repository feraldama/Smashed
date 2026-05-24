'use client';

import { Loader2, Save, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input, Select } from '@/components/ui/Input';
import { Switch, SwitchField } from '@/components/ui/Switch';
import { useProductos } from '@/hooks/useCatalogo';
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
  const [productoVentaId, setProductoVentaId] = useState<string>(opcion?.productoVentaId ?? '');
  const [soloSubprep, setSoloSubprep] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Incluir no-vendibles (las sub-preparaciones se excluyen del listado default).
  const { data: productos = [], isLoading: loadingProductos } = useProductos({
    incluirNoVendibles: true,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError('Nombre requerido');
    const precio = Number.parseInt(precioExtra, 10);
    if (Number.isNaN(precio) || precio < 0) return setError('Precio extra debe ser ≥ 0');
    const ord = Number.parseInt(orden, 10);
    if (Number.isNaN(ord) || ord < 0) return setError('Orden debe ser ≥ 0');

    try {
      const productoVentaIdValue = productoVentaId.trim() === '' ? null : productoVentaId;
      if (opcion) {
        await actualizar.mutateAsync({
          opcionId: opcion.id,
          nombre: nombre.trim(),
          precioExtra: precio,
          orden: ord,
          activo,
          productoVentaId: productoVentaIdValue,
        });
        toast.success('Opción actualizada');
      } else {
        await crear.mutateAsync({
          nombre: nombre.trim(),
          precioExtra: precio,
          orden: ord,
          activo,
          productoVentaId: productoVentaIdValue,
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
                label="Producto vinculado"
                hint={
                  productoVentaId
                    ? 'Al vender un ítem con esta opción, se descontará el stock según la receta del producto vinculado, multiplicado por la cantidad del ítem.'
                    : 'Sin vínculo: la opción no descuenta stock (ej: "sin sal", "extra picante").'
                }
              >
                <Select
                  value={productoVentaId}
                  onChange={(e) => setProductoVentaId(e.target.value)}
                  disabled={loadingProductos}
                >
                  <option value="">— Sin descuento de stock —</option>
                  {productos
                    .filter((p) => (soloSubprep ? p.esPreparacion : true))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.esPreparacion ? '🧪 ' : ''}
                        {p.nombre}
                        {p.codigo ? ` (${p.codigo})` : ''}
                      </option>
                    ))}
                </Select>
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
