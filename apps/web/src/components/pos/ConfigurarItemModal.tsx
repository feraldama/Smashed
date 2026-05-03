'use client';

import { Loader2, Minus, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { productoImagenSrc, useProductoDetalle } from '@/hooks/useCatalogo';
import {
  type ItemCarrito,
  type ItemCarritoCombo,
  type ItemCarritoModificador,
} from '@/lib/pos-cart';
import { cn } from '@/lib/utils';

// Tipos del shape que devuelve /catalogo/productos/:id (más flexible que ProductoDetalle del hook).

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
  /**
   * Si viene, el modal abre en modo "editar": precarga las selecciones y cantidad
   * desde el item del carrito y al confirmar reemplaza la línea en vez de crear una nueva.
   */
  initialItem?: ItemCarrito;
  onCancel: () => void;
  onConfirm: (item: Omit<ItemCarrito, 'lineId' | 'cantidad'> & { cantidad: number }) => void;
}

/**
 * Selecciones de modificadores indexadas por componente del combo.
 * - Clave `null` (representada como `__global__`): mods que aplican al item entero.
 * - Cualquier otra clave es un `comboGrupoId`: mods del componente elegido en ese grupo.
 *
 * Dentro de cada cubeta: `modificadorGrupoId → set<modificadorOpcionId>`.
 */
type ModSelMap = Record<string, Record<string, Set<string>>>;
const SCOPE_GLOBAL = '__global__';

export function ConfigurarItemModal({ productoId, initialItem, onCancel, onConfirm }: Props) {
  const { data: producto, isLoading } = useProductoDetalle(productoId);
  const isEdit = Boolean(initialItem);

  const [cantidad, setCantidad] = useState(initialItem?.cantidad ?? 1);
  const [observaciones, setObservaciones] = useState(initialItem?.observaciones ?? '');

  // Combos: 1 opción por grupo
  const [comboSel, setComboSel] = useState<Record<string, string>>(() => {
    if (!initialItem) return {};
    const init: Record<string, string> = {};
    for (const c of initialItem.combosOpcion) init[c.comboGrupoId] = c.comboGrupoOpcionId;
    return init;
  });

  // Modificadores: scope (global o comboGrupoId) → grupoId → set<opcionId>
  const [modSel, setModSel] = useState<ModSelMap>(() => {
    if (!initialItem) return {};
    const init: ModSelMap = {};
    for (const m of initialItem.modificadores) {
      const scope = m.comboGrupoId ?? SCOPE_GLOBAL;
      const bucket = init[scope] ?? {};
      const set = bucket[m.modificadorGrupoId] ?? new Set<string>();
      set.add(m.modificadorOpcionId);
      bucket[m.modificadorGrupoId] = set;
      init[scope] = bucket;
    }
    return init;
  });

  // Defaults al cargar (solo si NO estamos editando)
  useEffect(() => {
    if (isEdit) return;
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
  }, [producto, isEdit]);

  const combo = (producto?.combo as { grupos: ComboGrupo[] } | null) ?? null;
  const modGrupos = (producto?.modificadorGrupos as ModGrupo[] | undefined) ?? [];

  if (isLoading || !producto) {
    return (
      <ModalShell onCancel={onCancel} title="Configurando…">
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ModalShell>
    );
  }

  function toggleMod(scope: string, grupo: ModGrupo['modificadorGrupo'], opcionId: string) {
    setModSel((prev) => {
      const bucket = { ...(prev[scope] ?? {}) };
      const next = new Set(bucket[grupo.id] ?? []);
      if (grupo.tipo === 'UNICA') {
        next.clear();
        next.add(opcionId);
      } else {
        if (next.has(opcionId)) next.delete(opcionId);
        else next.add(opcionId);
      }
      bucket[grupo.id] = next;
      return { ...prev, [scope]: bucket };
    });
  }

  // Si el usuario cambia la opción de un grupo del combo, descartar las
  // selecciones de modificadores que tenía cargadas para ese componente.
  function handleComboChange(comboGrupoId: string, comboGrupoOpcionId: string) {
    setComboSel((p) => ({ ...p, [comboGrupoId]: comboGrupoOpcionId }));
    setModSel((prev) => {
      if (!prev[comboGrupoId]) return prev;
      const next = { ...prev };
      delete next[comboGrupoId];
      return next;
    });
  }

  return (
    <ModalShellWithProducto
      producto={producto}
      combo={combo}
      modGrupos={modGrupos}
      comboSel={comboSel}
      modSel={modSel}
      cantidad={cantidad}
      observaciones={observaciones}
      onCancel={onCancel}
      isEdit={isEdit}
      onCantidad={setCantidad}
      onObservaciones={setObservaciones}
      onComboChange={handleComboChange}
      onToggleMod={toggleMod}
      onConfirm={onConfirm}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Cuerpo del modal — separado para que los hooks de fetch de componentes del
//  combo se puedan llamar de forma estable (un sub-componente por grupo).
// ───────────────────────────────────────────────────────────────────────────

interface BodyProps {
  producto: {
    id: string;
    codigo: string | null;
    nombre: string;
    precio: string;
    imagenUrl: string | null;
    imagen: { updatedAt: string } | null;
  };
  combo: { grupos: ComboGrupo[] } | null;
  modGrupos: ModGrupo[];
  comboSel: Record<string, string>;
  modSel: ModSelMap;
  cantidad: number;
  observaciones: string;
  onCancel: () => void;
  isEdit: boolean;
  onCantidad: (n: number) => void;
  onObservaciones: (s: string) => void;
  onComboChange: (comboGrupoId: string, comboGrupoOpcionId: string) => void;
  onToggleMod: (scope: string, grupo: ModGrupo['modificadorGrupo'], opcionId: string) => void;
  onConfirm: Props['onConfirm'];
}

function ModalShellWithProducto({
  producto,
  combo,
  modGrupos,
  comboSel,
  modSel,
  cantidad,
  observaciones,
  onCancel,
  isEdit,
  onCantidad,
  onObservaciones,
  onComboChange,
  onToggleMod,
  onConfirm,
}: BodyProps) {
  // Por componente del combo: detalles de los productos elegidos + sus mods.
  // Lo levantamos al padre via callback `onComponentesDetail` para poder
  // calcular subtotal y validar.
  const [componentesDetail, setComponentesDetail] = useState<
    Record<string, ProductoComponenteDetalle>
  >({});

  const updateComponenteDetail = useCallback(
    (comboGrupoId: string, detail: ProductoComponenteDetalle) => {
      setComponentesDetail((prev) => {
        const existing = prev[comboGrupoId];
        if (existing && existing.productoVentaId === detail.productoVentaId) return prev;
        return { ...prev, [comboGrupoId]: detail };
      });
    },
    [],
  );

  const subtotalLinea = useMemo(() => {
    const base = Number(producto.precio);
    let extras = 0;
    if (combo) {
      for (const g of combo.grupos) {
        const opcionId = comboSel[g.id];
        const opcion = g.opciones.find((o) => o.id === opcionId);
        if (opcion?.precioExtra) extras += Number(opcion.precioExtra);
      }
    }
    // Mods globales del item
    const globalBucket = modSel[SCOPE_GLOBAL] ?? {};
    for (const mg of modGrupos) {
      const sel = globalBucket[mg.modificadorGrupo.id];
      if (!sel) continue;
      for (const o of mg.modificadorGrupo.opciones) {
        if (sel.has(o.id) && o.precioExtra) extras += Number(o.precioExtra);
      }
    }
    // Mods de los componentes del combo
    for (const [comboGrupoId, detail] of Object.entries(componentesDetail)) {
      const bucket = modSel[comboGrupoId] ?? {};
      for (const mg of detail.modificadorGrupos) {
        const sel = bucket[mg.modificadorGrupo.id];
        if (!sel) continue;
        for (const o of mg.modificadorGrupo.opciones) {
          if (sel.has(o.id) && o.precioExtra) extras += Number(o.precioExtra);
        }
      }
    }
    return (base + extras) * cantidad;
  }, [producto, combo, comboSel, modGrupos, modSel, cantidad, componentesDetail]);

  function validar(): string | null {
    if (combo) {
      for (const g of combo.grupos) {
        if (g.obligatorio && !comboSel[g.id]) {
          return `Elegí una opción para "${g.nombre}"`;
        }
      }
    }
    // Validar grupos globales
    const globalBucket = modSel[SCOPE_GLOBAL] ?? {};
    for (const mg of modGrupos) {
      const g = mg.modificadorGrupo;
      const sel = globalBucket[g.id] ?? new Set<string>();
      const err = validarGrupo(g, sel);
      if (err) return err;
    }
    // Validar grupos de cada componente del combo
    for (const [comboGrupoId, detail] of Object.entries(componentesDetail)) {
      const bucket = modSel[comboGrupoId] ?? {};
      for (const mg of detail.modificadorGrupos) {
        const g = mg.modificadorGrupo;
        const sel = bucket[g.id] ?? new Set<string>();
        const err = validarGrupo(g, sel, detail.nombre);
        if (err) return err;
      }
    }
    return null;
  }

  function handleConfirm() {
    const err = validar();
    if (err) {
      alert(err);
      return;
    }

    const modificadoresRes: ItemCarritoModificador[] = [];
    // Globales
    const globalBucket = modSel[SCOPE_GLOBAL] ?? {};
    for (const mg of modGrupos) {
      const g = mg.modificadorGrupo;
      const sel = globalBucket[g.id] ?? new Set<string>();
      for (const o of g.opciones) {
        if (sel.has(o.id)) {
          modificadoresRes.push({
            modificadorGrupoId: g.id,
            modificadorOpcionId: o.id,
            nombre: o.nombre,
            precioExtra: Number(o.precioExtra ?? 0),
          });
        }
      }
    }
    // Por componente del combo
    if (combo) {
      for (const cg of combo.grupos) {
        const detail = componentesDetail[cg.id];
        if (!detail) continue;
        const bucket = modSel[cg.id] ?? {};
        for (const mg of detail.modificadorGrupos) {
          const g = mg.modificadorGrupo;
          const sel = bucket[g.id] ?? new Set<string>();
          for (const o of g.opciones) {
            if (sel.has(o.id)) {
              modificadoresRes.push({
                modificadorGrupoId: g.id,
                modificadorOpcionId: o.id,
                nombre: o.nombre,
                precioExtra: Number(o.precioExtra ?? 0),
                comboGrupoId: cg.id,
                comboGrupoNombre: cg.nombre,
              });
            }
          }
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
      imagenUrl: productoImagenSrc(producto),
      precioUnitario: Number(producto.precio),
      cantidad,
      observaciones: observaciones.trim() || undefined,
      modificadores: modificadoresRes,
      combosOpcion: combosRes,
    });
  }

  return (
    <ModalShell onCancel={onCancel} title={producto.nombre}>
      <div className="max-h-[calc(90vh-180px)] space-y-4 overflow-y-auto p-4">
        {/* Combos */}
        {combo?.grupos.map((g) => {
          const opcionElegidaId = comboSel[g.id];
          const opcionElegida = g.opciones.find((o) => o.id === opcionElegidaId);
          return (
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
                      onChange={() => onComboChange(g.id, o.id)}
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
              {/* Sub-sección: modificadores del componente elegido */}
              {opcionElegida && (
                <ComponenteModificadores
                  comboGrupoId={g.id}
                  productoVentaId={opcionElegida.productoVenta.id}
                  productoNombre={opcionElegida.productoVenta.nombre}
                  modSel={modSel[g.id] ?? {}}
                  onToggle={onToggleMod}
                  onLoaded={updateComponenteDetail}
                />
              )}
            </section>
          );
        })}

        {/* Modificadores del item global (producto suelto, o el combo en sí) */}
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
                const checked = (modSel[SCOPE_GLOBAL]?.[g.id] ?? new Set()).has(o.id);
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
                      onChange={() => onToggleMod(SCOPE_GLOBAL, g, o.id)}
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
            onChange={(e) => onObservaciones(e.target.value)}
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
              onClick={() => onCantidad(Math.max(1, cantidad - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-input hover:bg-accent"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-10 text-center text-base font-bold tabular-nums">{cantidad}</span>
            <button
              type="button"
              onClick={() => onCantidad(Math.min(99, cantidad + 1))}
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
            {isEdit ? 'Guardar cambios' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Sub-componente: modificadores del producto elegido en un grupo del combo
// ───────────────────────────────────────────────────────────────────────────

interface ProductoComponenteDetalle {
  productoVentaId: string;
  nombre: string;
  modificadorGrupos: ModGrupo[];
}

function ComponenteModificadores({
  comboGrupoId,
  productoVentaId,
  productoNombre,
  modSel,
  onToggle,
  onLoaded,
}: {
  comboGrupoId: string;
  productoVentaId: string;
  productoNombre: string;
  modSel: Record<string, Set<string>>;
  onToggle: (scope: string, grupo: ModGrupo['modificadorGrupo'], opcionId: string) => void;
  onLoaded: (comboGrupoId: string, detail: ProductoComponenteDetalle) => void;
}) {
  const { data: detalle, isLoading } = useProductoDetalle(productoVentaId);
  // Memoizamos los grupos derivados para que el effect no se dispare en cada
  // render por una nueva referencia de array.
  const modGrupos = useMemo(
    () => (detalle?.modificadorGrupos as ModGrupo[] | undefined) ?? [],
    [detalle],
  );

  useEffect(() => {
    if (!detalle) return;
    onLoaded(comboGrupoId, {
      productoVentaId,
      nombre: productoNombre,
      modificadorGrupos: modGrupos,
    });
  }, [detalle, productoVentaId, comboGrupoId, productoNombre, onLoaded, modGrupos]);

  if (isLoading) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed bg-muted/10 p-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Cargando opciones de {productoNombre}…
      </div>
    );
  }

  if (modGrupos.length === 0) return null;

  return (
    <div className="mt-3 space-y-3 rounded-md border-l-2 border-primary/40 bg-muted/10 p-3 pl-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Modificá tu {productoNombre}:
      </p>
      {modGrupos.map(({ modificadorGrupo: g }) => (
        <div key={g.id}>
          <h4 className="mb-1.5 flex items-center gap-2 text-xs font-bold">
            {g.nombre}
            {g.obligatorio && (
              <span className="rounded-sm bg-red-100 px-1.5 py-0 text-[9px] font-semibold uppercase text-red-900">
                Obligatorio
              </span>
            )}
            <span className="text-[10px] font-normal text-muted-foreground">
              ({g.tipo === 'UNICA' ? 'Elegí 1' : 'Elegí varios'})
            </span>
          </h4>
          <div className="grid grid-cols-2 gap-1.5">
            {g.opciones.map((o) => {
              const checked = (modSel[g.id] ?? new Set()).has(o.id);
              return (
                <label
                  key={o.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-md border p-1.5 text-xs',
                    checked
                      ? 'border-primary bg-primary/5'
                      : 'border-input hover:border-primary/50',
                  )}
                >
                  <input
                    type={g.tipo === 'UNICA' ? 'radio' : 'checkbox'}
                    name={`mod-${comboGrupoId}-${g.id}`}
                    checked={checked}
                    onChange={() => onToggle(comboGrupoId, g, o.id)}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="flex-1">
                    <p className="font-medium">{o.nombre}</p>
                    {Number(o.precioExtra ?? 0) > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        +Gs. {Number(o.precioExtra).toLocaleString('es-PY')}
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────────────

function validarGrupo(
  g: ModGrupo['modificadorGrupo'],
  sel: Set<string>,
  contexto?: string,
): string | null {
  const prefix = contexto ? `${contexto} · ` : '';
  if (g.obligatorio && sel.size === 0) {
    return `${prefix}Elegí al menos una opción en "${g.nombre}"`;
  }
  if (g.minSelecciones && sel.size < g.minSelecciones) {
    return `${prefix}"${g.nombre}" requiere mínimo ${g.minSelecciones} opciones`;
  }
  if (g.maxSelecciones && sel.size > g.maxSelecciones) {
    return `${prefix}"${g.nombre}" permite máximo ${g.maxSelecciones} opciones`;
  }
  return null;
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
