'use client';

import { ChefHat, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input, Select } from '@/components/ui/Input';
import { useProductos, type ProductoDetalle } from '@/hooks/useCatalogo';
import {
  useEliminarReceta,
  useInsumos,
  useSetReceta,
  type UnidadMedida,
} from '@/hooks/useInventario';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const UNIDADES: UnidadMedida[] = [
  'UNIDAD',
  'KILOGRAMO',
  'GRAMO',
  'LITRO',
  'MILILITRO',
  'PORCION',
  'DOCENA',
];

interface RecetaItem {
  /** id local para el form. */
  localId: string;
  // XOR: insumo o sub-producto
  productoInventarioId: string | null;
  subProductoVentaId: string | null;
  // Snapshot para mostrar
  insumoNombre?: string;
  subProductoNombre?: string;
  cantidad: string;
  unidadMedida: UnidadMedida;
  esOpcional: boolean;
  notas: string;
}

interface RecetaEditorProps {
  producto: ProductoDetalle;
}

export function RecetaEditor({ producto }: RecetaEditorProps) {
  const setReceta = useSetReceta();
  const eliminarReceta = useEliminarReceta();
  const { data: insumosResp } = useInsumos();
  const { data: productosTodos = [] } = useProductos({ incluirNoVendibles: true });
  const insumos = insumosResp?.insumos ?? [];

  // Sub-productos disponibles: productos esPreparacion=true de la misma empresa, excluyendo a sí mismo
  const subProductos = productosTodos.filter(
    (p) => p.id !== producto.id && (p as { esPreparacion?: boolean }).esPreparacion,
  );

  const recetaExistente = producto.receta as {
    rinde: string;
    notas: string | null;
    items: Array<{
      id: string;
      productoInventarioId: string | null;
      subProductoVentaId: string | null;
      cantidad: string;
      unidadMedida: UnidadMedida;
      esOpcional: boolean;
      notas: string | null;
      insumo?: { id: string; nombre: string } | null;
      subProducto?: { id: string; nombre: string } | null;
    }>;
  } | null;

  const [rinde, setRinde] = useState(recetaExistente?.rinde ?? '1');
  const [notas, setNotas] = useState(recetaExistente?.notas ?? '');
  const [items, setItems] = useState<RecetaItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Pre-poblar items cuando llegan los datos
  useEffect(() => {
    if (recetaExistente?.items) {
      setItems(
        recetaExistente.items.map((it, idx) => ({
          localId: `it_${idx}_${Date.now()}`,
          productoInventarioId: it.productoInventarioId,
          subProductoVentaId: it.subProductoVentaId,
          insumoNombre: it.insumo?.nombre,
          subProductoNombre: it.subProducto?.nombre,
          cantidad: String(it.cantidad),
          unidadMedida: it.unidadMedida,
          esOpcional: it.esOpcional,
          notas: it.notas ?? '',
        })),
      );
    }
  }, [producto.id]);

  function agregarItem(tipo: 'INSUMO' | 'SUB') {
    setItems((prev) => [
      ...prev,
      {
        localId: `it_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        productoInventarioId: null,
        subProductoVentaId: null,
        cantidad: '1',
        unidadMedida: 'UNIDAD',
        esOpcional: false,
        notas: '',
      },
    ]);
    void tipo; // por ahora no diferenciamos; el user elige insumo o sub al hacer click en el select
  }

  function actualizarItem(localId: string, patch: Partial<RecetaItem>) {
    setItems((prev) => prev.map((it) => (it.localId === localId ? { ...it, ...patch } : it)));
  }

  function eliminarItem(localId: string) {
    setItems((prev) => prev.filter((it) => it.localId !== localId));
  }

  async function handleGuardar() {
    setError(null);
    if (items.length === 0) return setError('Agregá al menos un item a la receta');

    // Validar: cada item debe tener insumo XOR sub-producto
    for (const [idx, it] of items.entries()) {
      const tieneInsumo = Boolean(it.productoInventarioId);
      const tieneSub = Boolean(it.subProductoVentaId);
      if (tieneInsumo === tieneSub) {
        return setError(`Item ${idx + 1}: elegí insumo o sub-producto (no ambos ni ninguno)`);
      }
      const cant = Number.parseFloat(it.cantidad);
      if (Number.isNaN(cant) || cant <= 0) {
        return setError(`Item ${idx + 1}: cantidad inválida`);
      }
    }

    const rindeNum = Number.parseFloat(rinde);
    if (Number.isNaN(rindeNum) || rindeNum <= 0) return setError('Rinde inválido');

    try {
      await setReceta.mutateAsync({
        productoId: producto.id,
        rinde: rindeNum,
        notas: notas.trim() || undefined,
        items: items.map((it) => ({
          productoInventarioId: it.productoInventarioId ?? undefined,
          subProductoVentaId: it.subProductoVentaId ?? undefined,
          cantidad: Number.parseFloat(it.cantidad),
          unidadMedida: it.unidadMedida,
          esOpcional: it.esOpcional,
          notas: it.notas.trim() || undefined,
        })),
      });
      toast.success('Receta guardada');
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      let msg = apiErr?.message ?? 'Error al guardar receta';
      const fields =
        apiErr?.details && typeof apiErr.details === 'object'
          ? (apiErr.details as { fieldErrors?: Record<string, string[]> }).fieldErrors
          : undefined;
      if (fields) {
        const k = Object.keys(fields)[0];
        if (k && fields[k]?.[0]) msg = `${k}: ${fields[k][0]}`;
      }
      setError(msg);
    }
  }

  async function handleEliminarReceta() {
    if (
      !confirm(
        '¿Eliminar la receta de este producto? El descuento de stock al vender no se aplicará.',
      )
    )
      return;
    try {
      await eliminarReceta.mutateAsync(producto.id);
      setItems([]);
      setRinde('1');
      setNotas('');
      toast.success('Receta eliminada');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al eliminar');
    }
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ChefHat className="h-4 w-4 text-primary" />
            Receta
          </h2>
          <p className="text-xs text-muted-foreground">
            Insumos consumidos al vender. Si el producto es vendible y no tiene receta, no se
            descuenta stock.
          </p>
        </div>
        {recetaExistente && (
          <button
            type="button"
            onClick={() => {
              void handleEliminarReceta();
            }}
            disabled={eliminarReceta.isPending}
            className="rounded-md border border-destructive/30 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
          >
            Eliminar receta
          </button>
        )}
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-[120px_1fr]">
        <Field label="Rinde" hint="cuántas unidades produce">
          <Input
            type="number"
            step="0.001"
            value={rinde}
            onChange={(e) => setRinde(e.target.value)}
            className="font-mono"
          />
        </Field>
        <Field label="Notas">
          <Input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Tiempo de cocción, observaciones..."
          />
        </Field>
      </div>

      <div className="mb-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Items ({items.length})
        </p>
        <div className="space-y-2">
          {items.map((it) => (
            <ItemRow
              key={it.localId}
              item={it}
              insumos={insumos}
              subProductos={subProductos}
              onChange={(patch) => actualizarItem(it.localId, patch)}
              onRemove={() => eliminarItem(it.localId)}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => agregarItem('INSUMO')}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-input px-3 py-1.5 text-xs hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" /> Agregar item
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            void handleGuardar();
          }}
          disabled={setReceta.isPending || items.length === 0}
          className={cn(
            'flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground',
            'hover:bg-primary/90 disabled:opacity-60',
          )}
        >
          {setReceta.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Guardar receta
        </button>
      </div>
    </div>
  );
}

interface ItemRowProps {
  item: RecetaItem;
  insumos: Array<{ id: string; nombre: string; codigo: string | null; unidadMedida: UnidadMedida }>;
  subProductos: Array<{ id: string; nombre: string }>;
  onChange: (patch: Partial<RecetaItem>) => void;
  onRemove: () => void;
}

function ItemRow({ item, insumos, subProductos, onChange, onRemove }: ItemRowProps) {
  const tipo: 'INSUMO' | 'SUB' = item.subProductoVentaId ? 'SUB' : 'INSUMO';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2 md:flex-nowrap">
      {/* Tipo */}
      <Select
        value={tipo}
        onChange={(e) => {
          const nuevo = e.target.value as 'INSUMO' | 'SUB';
          onChange({
            productoInventarioId: nuevo === 'INSUMO' ? null : null,
            subProductoVentaId: nuevo === 'SUB' ? null : null,
          });
        }}
        className="w-28 shrink-0 px-2 py-1 text-xs"
      >
        <option value="INSUMO">Insumo</option>
        <option value="SUB">Sub-receta</option>
      </Select>

      {/* Selector */}
      {tipo === 'INSUMO' ? (
        <Select
          value={item.productoInventarioId ?? ''}
          onChange={(e) => {
            const id = e.target.value;
            const insumo = insumos.find((i) => i.id === id);
            onChange({
              productoInventarioId: id || null,
              insumoNombre: insumo?.nombre,
              ...(insumo ? { unidadMedida: insumo.unidadMedida } : {}),
            });
          }}
          className="min-w-0 flex-1 px-2 py-1 text-xs"
        >
          <option value="">— Elegí un insumo —</option>
          {insumos.map((i) => (
            <option key={i.id} value={i.id}>
              {i.codigo ? `[${i.codigo}] ` : ''}
              {i.nombre}
            </option>
          ))}
        </Select>
      ) : (
        <Select
          value={item.subProductoVentaId ?? ''}
          onChange={(e) => {
            const id = e.target.value;
            const sub = subProductos.find((s) => s.id === id);
            onChange({ subProductoVentaId: id || null, subProductoNombre: sub?.nombre });
          }}
          className="min-w-0 flex-1 px-2 py-1 text-xs"
        >
          <option value="">— Elegí una sub-receta —</option>
          {subProductos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </Select>
      )}

      {/* Cantidad */}
      <Input
        type="number"
        step="0.001"
        value={item.cantidad}
        onChange={(e) => onChange({ cantidad: e.target.value })}
        className="w-20 px-2 py-1 text-right font-mono text-xs"
      />

      {/* Unidad */}
      <Select
        value={item.unidadMedida}
        onChange={(e) => onChange({ unidadMedida: e.target.value as UnidadMedida })}
        className="w-24 px-2 py-1 text-xs"
      >
        {UNIDADES.map((u) => (
          <option key={u} value={u}>
            {u.toLowerCase()}
          </option>
        ))}
      </Select>

      {/* Opcional */}
      <label
        className="flex items-center gap-1 text-xs text-muted-foreground"
        title="Marcar como opcional"
      >
        <input
          type="checkbox"
          checked={item.esOpcional}
          onChange={(e) => onChange({ esOpcional: e.target.checked })}
          className="h-4 w-4 cursor-pointer rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        opc.
      </label>

      {/* Eliminar */}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-md p-1.5 text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
        aria-label="Eliminar item"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
