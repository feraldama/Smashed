'use client';

import { Loader2, Minus, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { toast } from './Toast';

import { useProductoDetalle } from '@/hooks/usePedidos';
import { useCartStore } from '@/lib/cart-store';
import { cn, formatGs } from '@/lib/utils';

/**
 * Modal de armado de pedido — se abre al hacer click en un producto que tiene
 * modificadores aplicables o que es combo.
 *
 * Para combos: cada grupo es radio (UNICA), una opción por grupo (default preseleccionada).
 * Para modificadores:
 *  - tipo UNICA   → radio buttons (1 obligatoria si grupo.obligatorio)
 *  - tipo MULTIPLE → checkboxes (con max si está seteado)
 */
interface ProductoModalProps {
  productoId: string;
  onClose: () => void;
}

export function ProductoModal({ productoId, onClose }: ProductoModalProps) {
  const { data: producto, isLoading } = useProductoDetalle(productoId);
  const agregar = useCartStore((s) => s.agregar);

  const [cantidad, setCantidad] = useState(1);
  const [observaciones, setObservaciones] = useState('');
  // modGrupoId → opcionIds[]
  const [modSeleccion, setModSeleccion] = useState<Record<string, string[]>>({});
  // comboGrupoId → opcionId
  const [comboSeleccion, setComboSeleccion] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pre-seleccionar opciones default del combo
  useEffect(() => {
    if (!producto?.combo) return;
    const next: Record<string, string> = {};
    for (const g of producto.combo.grupos) {
      const def = g.opciones.find((o) => o.esDefault) ?? g.opciones[0];
      if (def) next[g.id] = def.id;
    }
    setComboSeleccion(next);
  }, [producto?.combo]);

  // Pre-seleccionar primera opción de modificadores UNICA obligatorios
  useEffect(() => {
    if (!producto?.modificadorGrupos) return;
    const next: Record<string, string[]> = {};
    for (const mg of producto.modificadorGrupos) {
      const g = mg.modificadorGrupo;
      if (g.tipo === 'UNICA' && g.obligatorio && g.opciones.length > 0) {
        next[g.id] = [g.opciones[0]!.id];
      }
    }
    setModSeleccion(next);
  }, [producto?.modificadorGrupos]);

  const totales = useMemo(() => {
    if (!producto) return { precioBase: 0, extrasCombo: 0, extrasMod: 0, total: 0 };
    const precioBase = Number(producto.precio);
    let extrasCombo = 0;
    if (producto.combo) {
      for (const grupo of producto.combo.grupos) {
        const opcionId = comboSeleccion[grupo.id];
        if (!opcionId) continue;
        const opcion = grupo.opciones.find((o) => o.id === opcionId);
        if (opcion) extrasCombo += Number(opcion.precioExtra);
      }
    }
    let extrasMod = 0;
    for (const mg of producto.modificadorGrupos) {
      const seleccion = modSeleccion[mg.modificadorGrupo.id] ?? [];
      for (const optId of seleccion) {
        const opt = mg.modificadorGrupo.opciones.find((o) => o.id === optId);
        if (opt) extrasMod += Number(opt.precioExtra);
      }
    }
    return {
      precioBase,
      extrasCombo,
      extrasMod,
      total: (precioBase + extrasCombo + extrasMod) * cantidad,
    };
  }, [producto, cantidad, modSeleccion, comboSeleccion]);

  function toggleModificador(grupoId: string, opcionId: string, tipo: string, max?: number | null) {
    setModSeleccion((prev) => {
      const actual = prev[grupoId] ?? [];
      if (tipo === 'UNICA') {
        return { ...prev, [grupoId]: [opcionId] };
      }
      if (actual.includes(opcionId)) {
        return { ...prev, [grupoId]: actual.filter((id) => id !== opcionId) };
      }
      if (max && actual.length >= max) return prev;
      return { ...prev, [grupoId]: [...actual, opcionId] };
    });
  }

  function handleAgregar() {
    if (!producto) return;
    setErrorMsg(null);

    // Validar combo: opción por cada grupo obligatorio
    if (producto.combo) {
      for (const g of producto.combo.grupos) {
        if (g.obligatorio && !comboSeleccion[g.id]) {
          setErrorMsg(`Falta elegir opción para "${g.nombre}"`);
          return;
        }
      }
    }
    // Validar modificadores obligatorios + min/max
    for (const mg of producto.modificadorGrupos) {
      const g = mg.modificadorGrupo;
      const seleccion = modSeleccion[g.id] ?? [];
      if (g.obligatorio && seleccion.length === 0) {
        setErrorMsg(`"${g.nombre}" es obligatorio`);
        return;
      }
      if (g.minSeleccion > 0 && seleccion.length < g.minSeleccion) {
        setErrorMsg(`En "${g.nombre}" elegí al menos ${g.minSeleccion}`);
        return;
      }
    }

    // Armar el item
    const modificadoresFlat = producto.modificadorGrupos.flatMap((mg) =>
      (modSeleccion[mg.modificadorGrupo.id] ?? []).map((optId) => {
        const opt = mg.modificadorGrupo.opciones.find((o) => o.id === optId)!;
        return {
          modificadorOpcionId: opt.id,
          nombre: opt.nombre,
          precioExtra: Number(opt.precioExtra),
        };
      }),
    );

    const combosOpcionFlat = producto.combo
      ? producto.combo.grupos.flatMap((g) => {
          const optId = comboSeleccion[g.id];
          if (!optId) return [];
          const opt = g.opciones.find((o) => o.id === optId);
          if (!opt) return [];
          return [
            {
              comboGrupoId: g.id,
              comboGrupoNombre: g.nombre,
              comboGrupoOpcionId: opt.id,
              productoNombre: opt.productoVenta.nombre,
              precioExtra: Number(opt.precioExtra),
            },
          ];
        })
      : [];

    agregar({
      productoVentaId: producto.id,
      nombre: producto.nombre,
      imagenUrl: producto.imagenUrl,
      precioBase: totales.precioBase,
      precioExtraCombo: totales.extrasCombo,
      precioModificadores: totales.extrasMod,
      cantidad,
      observaciones: observaciones.trim() || null,
      modificadores: modificadoresFlat,
      combosOpcion: combosOpcionFlat,
      esCombo: producto.esCombo,
    });

    toast.success(`${cantidad} × ${producto.nombre} agregado`);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-2xl flex-col rounded-t-xl bg-card shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">{producto?.nombre ?? '...'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading || !producto ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-5">
              {producto.descripcion && (
                <p className="text-sm text-muted-foreground">{producto.descripcion}</p>
              )}

              {/* Grupos del combo */}
              {producto.combo?.grupos.map((grupo) => (
                <fieldset key={grupo.id} className="space-y-2">
                  <legend className="text-sm font-semibold">
                    {grupo.nombre}
                    {grupo.obligatorio && <span className="ml-1 text-destructive">*</span>}
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {grupo.opciones.map((opt) => {
                      const checked = comboSeleccion[grupo.id] === opt.id;
                      return (
                        <label
                          key={opt.id}
                          className={cn(
                            'flex cursor-pointer items-center justify-between gap-2 rounded-md border p-3 text-sm transition-colors',
                            checked
                              ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                              : 'border-input hover:bg-accent',
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={`combo-${grupo.id}`}
                              checked={checked}
                              onChange={() =>
                                setComboSeleccion((p) => ({ ...p, [grupo.id]: opt.id }))
                              }
                              className="h-4 w-4 accent-primary"
                            />
                            <span>{opt.productoVenta.nombre}</span>
                          </span>
                          {Number(opt.precioExtra) > 0 && (
                            <span className="font-mono text-xs text-muted-foreground">
                              +{formatGs(opt.precioExtra)}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}

              {/* Grupos de modificadores */}
              {producto.modificadorGrupos.map((mg) => {
                const grupo = mg.modificadorGrupo;
                const seleccion = modSeleccion[grupo.id] ?? [];
                return (
                  <fieldset key={grupo.id} className="space-y-2">
                    <legend className="text-sm font-semibold">
                      {grupo.nombre}
                      {grupo.obligatorio && <span className="ml-1 text-destructive">*</span>}
                      {grupo.maxSeleccion && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          (máx {grupo.maxSeleccion})
                        </span>
                      )}
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {grupo.opciones.map((opt) => {
                        const checked = seleccion.includes(opt.id);
                        return (
                          <label
                            key={opt.id}
                            className={cn(
                              'flex cursor-pointer items-center justify-between gap-2 rounded-md border p-2.5 text-sm transition-colors',
                              checked
                                ? 'border-primary bg-primary/5'
                                : 'border-input hover:bg-accent',
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <input
                                type={grupo.tipo === 'UNICA' ? 'radio' : 'checkbox'}
                                name={grupo.tipo === 'UNICA' ? `mod-${grupo.id}` : undefined}
                                checked={checked}
                                onChange={() =>
                                  toggleModificador(
                                    grupo.id,
                                    opt.id,
                                    grupo.tipo,
                                    grupo.maxSeleccion,
                                  )
                                }
                                className="h-4 w-4 accent-primary"
                              />
                              <span>{opt.nombre}</span>
                            </span>
                            {Number(opt.precioExtra) > 0 && (
                              <span className="font-mono text-xs text-muted-foreground">
                                +{formatGs(opt.precioExtra)}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}

              {/* Observaciones */}
              <div>
                <label htmlFor="obs" className="text-sm font-semibold">
                  Observaciones
                </label>
                <textarea
                  id="obs"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  placeholder="Para llevar, sin servilleta, etc."
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer fijo */}
        {producto && (
          <div className="border-t bg-card p-4">
            {errorMsg && (
              <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {errorMsg}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              {/* Selector de cantidad */}
              <div className="flex items-center gap-1 rounded-md border">
                <button
                  type="button"
                  onClick={() => setCantidad(Math.max(1, cantidad - 1))}
                  className="px-2 py-2 hover:bg-muted"
                  aria-label="Disminuir cantidad"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center text-sm font-mono font-semibold">{cantidad}</span>
                <button
                  type="button"
                  onClick={() => setCantidad(cantidad + 1)}
                  className="px-2 py-2 hover:bg-muted"
                  aria-label="Aumentar cantidad"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleAgregar}
                className="flex flex-1 items-center justify-between gap-3 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
              >
                <span>Agregar al pedido</span>
                <span className="font-mono">{formatGs(totales.total)}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
