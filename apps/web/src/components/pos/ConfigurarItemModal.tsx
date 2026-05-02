'use client';

import { Loader2, Minus, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useProductoDetalle } from '@/hooks/useCatalogo';
import {
  type ItemCarrito,
  type ItemCarritoCombo,
  type ItemCarritoModificador,
} from '@/lib/pos-cart';
import { cn } from '@/lib/utils';

// Tipos del shape que devuelve /catalogo/productos/:id (más flexible que ProductoDetalle del hook).
interface Opcion {
  id: string;
  nombre: string;
  precioExtra?: string | number;
  esDefault?: boolean;
}

interface ComboGrupo {
  id: string;
  nombre: string;
  obligatorio: boolean;
  opciones: {
    id: string;
    precioExtra?: string | number;
    esDefault?: boolean;
    productoVenta: { id: string; nombre: string };
  }[];
}

interface ModGrupo {
  modificadorGrupo: {
    id: string;
    nombre: string;
    tipo: 'UNICA' | 'MULTIPLE';
    obligatorio: boolean;
    minSelecciones?: number;
    maxSelecciones?: number;
    opciones: { id: string; nombre: string; precioExtra?: string | number }[];
  };
}

interface Props {
  productoId: string;
  onCancel: () => void;
  onConfirm: (item: Omit<ItemCarrito, 'lineId' | 'cantidad'> & { cantidad: number }) => void;
}

export function ConfigurarItemModal({ productoId, onCancel, onConfirm }: Props) {
  const { data: producto, isLoading } = useProductoDetalle(productoId);

  const [cantidad, setCantidad] = useState(1);
  const [observaciones, setObservaciones] = useState('');

  // Combos: 1 opción por grupo
  const [comboSel, setComboSel] = useState<Record<string, string>>({});
  // Modificadores: opcionId → seleccionado
  const [modSel, setModSel] = useState<Record<string, Set<string>>>({});

  // Defaults al cargar
  useEffect(() => {
    if (!producto) return;
    const combo = producto.combo as { grupos: ComboGrupo[] } | null;
    if (combo?.grupos) {
      const init: Record<string, string> = {};
      for (const g of combo.grupos) {
        const def = g.opciones.find((o) => o.esDefault) ?? g.opciones[0];
        if (def) init[g.id] = def.id;
      }
      setComboSel(init);
    }
  }, [producto]);

  const combo = (producto?.combo as { grupos: ComboGrupo[] } | null) ?? null;
  const modGrupos = (producto?.modificadorGrupos as ModGrupo[] | undefined) ?? [];

  const subtotalLinea = useMemo(() => {
    if (!producto) return 0;
    const base = Number(producto.precio);
    let extras = 0;
    if (combo) {
      for (const g of combo.grupos) {
        const opcionId = comboSel[g.id];
        const opcion = g.opciones.find((o) => o.id === opcionId);
        if (opcion?.precioExtra) extras += Number(opcion.precioExtra);
      }
    }
    for (const mg of modGrupos) {
      const grupoId = mg.modificadorGrupo.id;
      const sel = modSel[grupoId];
      if (!sel) continue;
      for (const o of mg.modificadorGrupo.opciones) {
        if (sel.has(o.id) && o.precioExtra) extras += Number(o.precioExtra);
      }
    }
    return (base + extras) * cantidad;
  }, [producto, combo, comboSel, modGrupos, modSel, cantidad]);

  if (isLoading || !producto) {
    return (
      <ModalShell onCancel={onCancel} title="Configurando…">
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ModalShell>
    );
  }

  // Validaciones
  function validar(): string | null {
    if (combo) {
      for (const g of combo.grupos) {
        if (g.obligatorio && !comboSel[g.id]) {
          return `Elegí una opción para "${g.nombre}"`;
        }
      }
    }
    for (const mg of modGrupos) {
      const g = mg.modificadorGrupo;
      const sel = modSel[g.id] ?? new Set();
      if (g.obligatorio && sel.size === 0) {
        return `Elegí al menos una opción en "${g.nombre}"`;
      }
      if (g.minSelecciones && sel.size < g.minSelecciones) {
        return `"${g.nombre}" requiere mínimo ${g.minSelecciones} opciones`;
      }
      if (g.maxSelecciones && sel.size > g.maxSelecciones) {
        return `"${g.nombre}" permite máximo ${g.maxSelecciones} opciones`;
      }
    }
    return null;
  }

  function handleConfirm() {
    if (!producto) return;
    const err = validar();
    if (err) {
      alert(err);
      return;
    }

    const modificadoresRes: ItemCarritoModificador[] = [];
    for (const mg of modGrupos) {
      const grupoId = mg.modificadorGrupo.id;
      const sel = modSel[grupoId] ?? new Set();
      for (const o of mg.modificadorGrupo.opciones) {
        if (sel.has(o.id)) {
          modificadoresRes.push({
            modificadorGrupoId: grupoId,
            modificadorOpcionId: o.id,
            nombre: o.nombre,
            precioExtra: Number(o.precioExtra ?? 0),
          });
        }
      }
    }

    const combosRes: ItemCarritoCombo[] = [];
    if (combo) {
      for (const g of combo.grupos) {
        const opcionId = comboSel[g.id];
        if (!opcionId) continue;
        const opcion = g.opciones.find((o) => o.id === opcionId);
        if (!opcion) continue;
        combosRes.push({
          comboGrupoId: g.id,
          comboGrupoOpcionId: opcion.id,
          grupoNombre: g.nombre,
          opcionNombre: opcion.productoVenta.nombre,
          precioExtra: Number(opcion.precioExtra ?? 0),
        });
      }
    }

    onConfirm({
      productoVentaId: producto.id,
      codigo: producto.codigo,
      nombre: producto.nombre,
      imagenUrl: producto.imagenUrl,
      precioUnitario: Number(producto.precio),
      cantidad,
      observaciones: observaciones.trim() || undefined,
      modificadores: modificadoresRes,
      combosOpcion: combosRes,
    });
  }

  function toggleMod(grupo: ModGrupo['modificadorGrupo'], opcionId: string) {
    setModSel((prev) => {
      const next = new Set(prev[grupo.id] ?? []);
      if (grupo.tipo === 'UNICA') {
        next.clear();
        next.add(opcionId);
      } else {
        if (next.has(opcionId)) next.delete(opcionId);
        else next.add(opcionId);
      }
      return { ...prev, [grupo.id]: next };
    });
  }

  return (
    <ModalShell onCancel={onCancel} title={producto.nombre}>
      <div className="max-h-[calc(90vh-180px)] space-y-4 overflow-y-auto p-4">
        {/* Combos */}
        {combo?.grupos.map((g) => (
          <section key={g.id}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
              {g.nombre}
              {g.obligatorio && (
                <span className="rounded-sm bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-900">
                  Obligatorio
                </span>
              )}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {g.opciones.map((o) => (
                <label
                  key={o.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm',
                    comboSel[g.id] === o.id
                      ? 'border-primary bg-primary/5'
                      : 'border-input hover:border-primary/50',
                  )}
                >
                  <input
                    type="radio"
                    name={`combo-${g.id}`}
                    value={o.id}
                    checked={comboSel[g.id] === o.id}
                    onChange={() => setComboSel((p) => ({ ...p, [g.id]: o.id }))}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="flex-1">
                    <p className="font-medium">{o.productoVenta.nombre}</p>
                    {Number(o.precioExtra ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        +Gs. {Number(o.precioExtra).toLocaleString('es-PY')}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </section>
        ))}

        {/* Modificadores */}
        {modGrupos.map(({ modificadorGrupo: g }) => (
          <section key={g.id}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
              {g.nombre}
              {g.obligatorio && (
                <span className="rounded-sm bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-900">
                  Obligatorio
                </span>
              )}
              <span className="text-xs font-normal text-muted-foreground">
                ({g.tipo === 'UNICA' ? 'Elegí 1' : 'Elegí varios'})
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {g.opciones.map((o) => {
                const checked = modSel[g.id]?.has(o.id) ?? false;
                return (
                  <label
                    key={o.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm',
                      checked
                        ? 'border-primary bg-primary/5'
                        : 'border-input hover:border-primary/50',
                    )}
                  >
                    <input
                      type={g.tipo === 'UNICA' ? 'radio' : 'checkbox'}
                      name={`mod-${g.id}`}
                      checked={checked}
                      onChange={() => toggleMod(g, o.id)}
                      className="mt-0.5 accent-primary"
                    />
                    <div className="flex-1">
                      <p className="font-medium">{o.nombre}</p>
                      {Number(o.precioExtra ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          +Gs. {Number(o.precioExtra).toLocaleString('es-PY')}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </section>
        ))}

        {/* Observaciones */}
        <section>
          <h3 className="mb-2 text-sm font-bold">Observaciones</h3>
          <input
            type="text"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            maxLength={300}
            placeholder="ej: sin cebolla, bien cocido"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </section>

        {/* Cantidad */}
        <section className="flex items-center justify-between rounded-md border p-3">
          <span className="text-sm font-bold">Cantidad</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-input hover:bg-accent"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-10 text-center text-base font-bold tabular-nums">{cantidad}</span>
            <button
              type="button"
              onClick={() => setCantidad((c) => Math.min(99, c + 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-input hover:bg-accent"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Subtotal</p>
          <p className="text-lg font-bold tabular-nums">
            Gs. {subtotalLinea.toLocaleString('es-PY')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            Agregar al carrito
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  children,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-bold">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm p-1 hover:bg-muted"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
