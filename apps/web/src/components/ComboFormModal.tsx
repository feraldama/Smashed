'use client';

import { Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import {
  type ComboConfig,
  type ProductoListado,
  type SetComboInput,
  useActualizarProducto,
  useCategorias,
  useCrearProducto,
  useProductoDetalle,
  useProductos,
  useSetCombo,
} from '@/hooks/useCatalogo';
import { ApiError } from '@/lib/api';

interface Props {
  productoId: string | null;
  onClose: () => void;
}

interface OpcionDraft {
  key: string;
  productoVentaId: string;
  precioExtra: string;
  esDefault: boolean;
}

interface GrupoDraft {
  key: string;
  nombre: string;
  obligatorio: boolean;
  opciones: OpcionDraft[];
}

function nuevoKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function grupoVacio(): GrupoDraft {
  return {
    key: nuevoKey(),
    nombre: '',
    obligatorio: true,
    opciones: [opcionVacia()],
  };
}

function opcionVacia(): OpcionDraft {
  return { key: nuevoKey(), productoVentaId: '', precioExtra: '0', esDefault: false };
}

function comboConfigToDrafts(combo: ComboConfig | null): GrupoDraft[] {
  if (!combo) return [grupoVacio()];
  return combo.grupos.map((g) => ({
    key: g.id,
    nombre: g.nombre,
    obligatorio: g.obligatorio,
    opciones: g.opciones.map((o) => ({
      key: o.id,
      productoVentaId: o.productoVentaId,
      precioExtra: String(o.precioExtra ?? '0'),
      esDefault: o.esDefault,
    })),
  }));
}

export function ComboFormModal({ productoId, onClose }: Props) {
  const isEdit = Boolean(productoId);
  const detalle = useProductoDetalle(productoId);
  const productos = useProductos({ esCombo: false });
  const { data: categorias = [] } = useCategorias();

  const crearProducto = useCrearProducto();
  const actualizarProducto = useActualizarProducto();
  const setCombo = useSetCombo();
  const isPending = crearProducto.isPending || actualizarProducto.isPending || setCombo.isPending;

  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [precioBase, setPrecioBase] = useState('0');
  const [descripcion, setDescripcion] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [grupos, setGrupos] = useState<GrupoDraft[]>([grupoVacio()]);
  const [hidratado, setHidratado] = useState(!isEdit);
  const [error, setError] = useState<string | null>(null);

  // Al crear un combo nuevo, defaulteamos la categoría a la primera con base COMBO
  // para que aparezca bajo el tab "Combos" del POS sin que el usuario tenga que pensarlo.
  useEffect(() => {
    if (isEdit) return;
    if (categoriaId) return;
    const def = categorias.find((c) => c.categoriaBase === 'COMBO');
    if (def) setCategoriaId(def.id);
  }, [isEdit, categoriaId, categorias]);

  useEffect(() => {
    if (!isEdit) return;
    if (!detalle.data) return;
    if (hidratado) return;
    const p = detalle.data;
    setNombre(p.nombre);
    setCodigo(p.codigo ?? '');
    setPrecioBase(String(p.precioBase));
    setDescripcion(p.combo?.descripcion ?? '');
    setCategoriaId(p.categoria?.id ?? '');
    setGrupos(comboConfigToDrafts(p.combo));
    setHidratado(true);
  }, [isEdit, detalle.data, hidratado]);

  const productosDisponibles = useMemo<ProductoListado[]>(
    () => productos.data ?? [],
    [productos.data],
  );

  function actualizarGrupo(key: string, patch: Partial<GrupoDraft>) {
    setGrupos((g) => g.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function agregarGrupo() {
    setGrupos((g) => [...g, grupoVacio()]);
  }

  function borrarGrupo(key: string) {
    setGrupos((g) => (g.length === 1 ? g : g.filter((it) => it.key !== key)));
  }

  function agregarOpcion(grupoKey: string) {
    setGrupos((g) =>
      g.map((it) =>
        it.key === grupoKey ? { ...it, opciones: [...it.opciones, opcionVacia()] } : it,
      ),
    );
  }

  function borrarOpcion(grupoKey: string, opcionKey: string) {
    setGrupos((g) =>
      g.map((it) =>
        it.key === grupoKey && it.opciones.length > 1
          ? { ...it, opciones: it.opciones.filter((o) => o.key !== opcionKey) }
          : it,
      ),
    );
  }

  function actualizarOpcion(grupoKey: string, opcionKey: string, patch: Partial<OpcionDraft>) {
    setGrupos((g) =>
      g.map((it) =>
        it.key === grupoKey
          ? {
              ...it,
              opciones: it.opciones.map((o) => (o.key === opcionKey ? { ...o, ...patch } : o)),
            }
          : it,
      ),
    );
  }

  function marcarDefault(grupoKey: string, opcionKey: string) {
    setGrupos((g) =>
      g.map((it) =>
        it.key === grupoKey
          ? {
              ...it,
              opciones: it.opciones.map((o) => ({ ...o, esDefault: o.key === opcionKey })),
            }
          : it,
      ),
    );
  }

  function validar(): SetComboInput | string {
    if (!nombre.trim()) return 'Nombre del combo requerido';
    const precio = Number(precioBase.replace(/\D/g, ''));
    if (!Number.isFinite(precio) || precio < 0) return 'Precio base inválido';
    if (grupos.length === 0) return 'Agregá al menos un grupo';

    const grupoInputs: SetComboInput['grupos'] = [];
    for (const [i, g] of grupos.entries()) {
      if (!g.nombre.trim()) return `Grupo ${i + 1}: nombre requerido`;
      if (g.opciones.length === 0) return `Grupo ${i + 1}: agregá al menos una opción`;
      const productosUsados = new Set<string>();
      const opcionInputs: SetComboInput['grupos'][number]['opciones'] = [];
      for (const [j, o] of g.opciones.entries()) {
        if (!o.productoVentaId) return `Grupo ${i + 1}, opción ${j + 1}: elegí un producto`;
        if (productosUsados.has(o.productoVentaId)) {
          return `Grupo ${i + 1}: hay productos repetidos`;
        }
        productosUsados.add(o.productoVentaId);
        const extra = Number(o.precioExtra.replace(/\D/g, '')) || 0;
        opcionInputs.push({
          productoVentaId: o.productoVentaId,
          precioExtra: extra,
          esDefault: o.esDefault,
          orden: j,
        });
      }
      grupoInputs.push({
        nombre: g.nombre.trim(),
        orden: i,
        obligatorio: g.obligatorio,
        opciones: opcionInputs,
      });
    }
    return {
      descripcion: descripcion.trim() || undefined,
      grupos: grupoInputs,
    };
  }

  function extractApiError(err: unknown, fallback = 'Error al guardar'): string {
    const apiErr = err instanceof ApiError ? err : null;
    let msg = apiErr?.message ?? fallback;
    const details =
      apiErr?.details && typeof apiErr.details === 'object'
        ? (apiErr.details as { fieldErrors?: Record<string, string[]> })
        : undefined;
    const fields = details?.fieldErrors;
    if (fields) {
      const k = Object.keys(fields)[0];
      if (k && fields[k]?.[0]) msg = `${k}: ${fields[k][0]}`;
    } else if (apiErr?.details && typeof apiErr.details === 'object') {
      const flat = apiErr.details;
      const k = Object.keys(flat)[0];
      if (k && typeof flat[k] === 'string') msg = `${k}: ${flat[k]}`;
    }
    return msg;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = validar();
    if (typeof result === 'string') return setError(result);

    const productoPayload = {
      nombre: nombre.trim(),
      codigo: codigo.trim() || undefined,
      precioBase: Number(precioBase.replace(/\D/g, '')),
      categoriaId: categoriaId || undefined,
      esCombo: true as const,
    };

    try {
      let id = productoId;
      if (id) {
        await actualizarProducto.mutateAsync({ id, ...productoPayload });
      } else {
        const created = await crearProducto.mutateAsync(productoPayload);
        id = created.producto.id;
      }
      await setCombo.mutateAsync({ id, input: result });
      toast.success(isEdit ? 'Combo actualizado' : 'Combo creado');
      onClose();
    } catch (err) {
      setError(extractApiError(err));
    }
  }

  if (isEdit && !hidratado) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="rounded-lg bg-card p-8 shadow-2xl">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">{isEdit ? 'Editar combo' : 'Nuevo combo'}</h2>
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
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Datos del combo</h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_180px_160px]">
                <Field label="Nombre" required>
                  <Input
                    autoFocus
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Combo Smash"
                  />
                </Field>
                <Field label="Código" hint="opcional">
                  <Input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                    className="font-mono"
                    placeholder="COMBO-SMASH"
                  />
                </Field>
                <Field label="Precio base (₲)" required>
                  <Input
                    inputMode="numeric"
                    value={precioBase}
                    onChange={(e) => setPrecioBase(e.target.value.replace(/\D/g, ''))}
                    className="text-right font-mono"
                    placeholder="0"
                  />
                </Field>
              </div>
              <Field label="Categoría" hint="determina bajo qué pestaña aparece en el POS">
                <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                  <option value="">— Sin categoría —</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Descripción del combo" hint="visible al armar el combo">
                <Textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={2}
                  placeholder="Armá tu combo eligiendo hamburguesa, acompañamiento y bebida"
                />
              </Field>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground">Grupos de opciones</h3>
                <button
                  type="button"
                  onClick={agregarGrupo}
                  className="flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar grupo
                </button>
              </div>

              {productos.isLoading ? (
                <div className="flex h-20 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : productosDisponibles.length === 0 ? (
                <div className="rounded-md border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                  No hay productos no-combo cargados. Creá productos antes de armar opciones.
                </div>
              ) : (
                <div className="space-y-3">
                  {grupos.map((g, i) => (
                    <GrupoEditor
                      key={g.key}
                      grupo={g}
                      index={i}
                      productos={productosDisponibles}
                      onActualizar={(patch) => actualizarGrupo(g.key, patch)}
                      onBorrar={() => borrarGrupo(g.key)}
                      onAgregarOpcion={() => agregarOpcion(g.key)}
                      onBorrarOpcion={(opKey) => borrarOpcion(g.key, opKey)}
                      onActualizarOpcion={(opKey, patch) => actualizarOpcion(g.key, opKey, patch)}
                      onMarcarDefault={(opKey) => marcarDefault(g.key, opKey)}
                      puedeBorrar={grupos.length > 1}
                    />
                  ))}
                </div>
              )}
            </section>

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
              disabled={isPending || productosDisponibles.length === 0}
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

interface GrupoEditorProps {
  grupo: GrupoDraft;
  index: number;
  productos: ProductoListado[];
  puedeBorrar: boolean;
  onActualizar: (patch: Partial<GrupoDraft>) => void;
  onBorrar: () => void;
  onAgregarOpcion: () => void;
  onBorrarOpcion: (key: string) => void;
  onActualizarOpcion: (key: string, patch: Partial<OpcionDraft>) => void;
  onMarcarDefault: (key: string) => void;
}

function GrupoEditor({
  grupo,
  index,
  productos,
  puedeBorrar,
  onActualizar,
  onBorrar,
  onAgregarOpcion,
  onBorrarOpcion,
  onActualizarOpcion,
  onMarcarDefault,
}: GrupoEditorProps) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex-1 space-y-3">
          <Field label={`Grupo ${index + 1} — nombre`} required>
            <Input
              value={grupo.nombre}
              onChange={(e) => onActualizar({ nombre: e.target.value })}
              placeholder="Elegí tu hamburguesa"
            />
          </Field>
          <SwitchField
            label="Obligatorio"
            description="Si está activo, el cliente debe elegir una opción de este grupo"
            checked={grupo.obligatorio}
            onCheckedChange={(v) => onActualizar({ obligatorio: v })}
          />
        </div>
        <button
          type="button"
          onClick={onBorrar}
          disabled={!puedeBorrar}
          className="rounded-md border border-destructive/30 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-40"
          aria-label="Eliminar grupo"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>Opciones</span>
          <button
            type="button"
            onClick={onAgregarOpcion}
            className="flex items-center gap-1 rounded-md border border-input px-2 py-0.5 text-xs hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> Agregar opción
          </button>
        </div>
        {grupo.opciones.map((o) => (
          <div
            key={o.key}
            className="grid gap-2 rounded-md border bg-card p-2 sm:grid-cols-[1fr_120px_auto_auto]"
          >
            <Select
              value={o.productoVentaId}
              onChange={(e) => onActualizarOpcion(o.key, { productoVentaId: e.target.value })}
            >
              <option value="">— Elegí producto —</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo ? `[${p.codigo}] ` : ''}
                  {p.nombre}
                </option>
              ))}
            </Select>
            <Input
              inputMode="numeric"
              value={o.precioExtra}
              onChange={(e) =>
                onActualizarOpcion(o.key, { precioExtra: e.target.value.replace(/\D/g, '') })
              }
              className="text-right font-mono"
              placeholder="+₲"
              title="Precio extra sobre el combo"
            />
            <label className="flex items-center gap-1 px-2 text-xs">
              <input
                type="radio"
                name={`default-${grupo.key}`}
                checked={o.esDefault}
                onChange={() => onMarcarDefault(o.key)}
              />
              Default
            </label>
            <button
              type="button"
              onClick={() => onBorrarOpcion(o.key)}
              disabled={grupo.opciones.length === 1}
              className="rounded-md border border-destructive/30 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-40"
              aria-label="Eliminar opción"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
