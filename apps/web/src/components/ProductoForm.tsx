'use client';

import { ImageOff, Loader2, Save, Sliders, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ProductoModificadoresSection } from '@/components/ProductoModificadoresSection';
import { confirmar, toast } from '@/components/Toast';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import {
  productoImagenSrc,
  type ProductoDetalle,
  useActualizarProducto,
  useCategorias,
  useCrearProducto,
  useEliminarImagenProducto,
  useSubirImagenProducto,
} from '@/hooks/useCatalogo';
import { ApiError } from '@/lib/api';
import { cn, formatGs } from '@/lib/utils';

const TAMANO_MAX_MB = 5;

const SECTORES = [
  'COCINA_CALIENTE',
  'COCINA_FRIA',
  'PARRILLA',
  'BAR',
  'CAFETERIA',
  'POSTRES',
] as const;
const TASAS = ['IVA_10', 'IVA_5', 'IVA_0', 'EXENTO'] as const;

interface ProductoFormProps {
  producto?: ProductoDetalle;
}

export function ProductoForm({ producto }: ProductoFormProps) {
  const router = useRouter();
  const { data: categorias = [] } = useCategorias();
  const crear = useCrearProducto();
  const actualizar = useActualizarProducto();
  const subirImagen = useSubirImagenProducto();
  const eliminarImagen = useEliminarImagenProducto();

  const [nombre, setNombre] = useState(producto?.nombre ?? '');
  const [codigo, setCodigo] = useState(producto?.codigo ?? '');
  const [codigoBarras, setCodigoBarras] = useState(producto?.codigoBarras ?? '');
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '');
  const [precioBase, setPrecioBase] = useState(producto ? String(producto.precioBase) : '');
  const [tasaIva, setTasaIva] = useState<(typeof TASAS)[number]>(
    (producto?.tasaIva as (typeof TASAS)[number]) ?? 'IVA_10',
  );
  const [categoriaId, setCategoriaId] = useState(producto?.categoria?.id ?? '');
  const [imagenUrl, setImagenUrl] = useState(producto?.imagenUrl ?? '');
  const [imagenError, setImagenError] = useState(false);
  // Archivo seleccionado en el input file (todavía no subido — sube al guardar)
  const [archivoLocal, setArchivoLocal] = useState<File | null>(null);
  const [archivoPreview, setArchivoPreview] = useState<string | null>(null);
  const [sectorComanda, setSectorComanda] = useState<string>(producto?.sectorComanda ?? '');
  const [tiempoPrep, setTiempoPrep] = useState(
    producto?.tiempoPrepSegundos ? String(producto.tiempoPrepSegundos) : '',
  );
  const [esCombo, setEsCombo] = useState(producto?.esCombo ?? false);
  const [esVendible, setEsVendible] = useState(producto?.esVendible ?? true);
  const [esPreparacion, setEsPreparacion] = useState(producto?.esPreparacion ?? false);

  const [error, setError] = useState<string | null>(null);
  const isPending =
    crear.isPending || actualizar.isPending || subirImagen.isPending || eliminarImagen.isPending;

  const precioPreview = Number.parseInt(precioBase.replace(/[^\d]/g, ''), 10);

  // Liberar el ObjectURL del preview cuando se reemplace o se desmonte el form
  useEffect(() => {
    return () => {
      if (archivoPreview) URL.revokeObjectURL(archivoPreview);
    };
  }, [archivoPreview]);

  // URL final a mostrar — preview local > imagen subida en BD > imagenUrl externa
  const imagenSrcActual = archivoPreview ?? (producto ? productoImagenSrc(producto) : null) ?? null;
  const tieneImagenSubida = Boolean(producto?.imagen);

  function handleArchivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-seleccionar el mismo archivo
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('El archivo no es una imagen');
      return;
    }
    if (file.size > TAMANO_MAX_MB * 1024 * 1024) {
      toast.error(`Imagen demasiado grande (máx ${TAMANO_MAX_MB} MB)`);
      return;
    }
    if (archivoPreview) URL.revokeObjectURL(archivoPreview);
    setArchivoLocal(file);
    setArchivoPreview(URL.createObjectURL(file));
    setImagenError(false);
  }

  function descartarArchivoSeleccionado() {
    if (archivoPreview) URL.revokeObjectURL(archivoPreview);
    setArchivoLocal(null);
    setArchivoPreview(null);
  }

  async function handleEliminarImagenSubida() {
    if (!producto?.imagen) return;
    const ok = await confirmar({
      titulo: 'Eliminar imagen',
      mensaje: '¿Eliminar la imagen subida?',
      destructivo: true,
      textoConfirmar: 'Eliminar',
    });
    if (!ok) return;
    try {
      await eliminarImagen.mutateAsync(producto.id);
      toast.success('Imagen eliminada');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al eliminar imagen');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const precioNum = Number.parseInt(precioBase.replace(/[^\d]/g, ''), 10);
    if (!nombre.trim()) return setError('Nombre requerido');
    if (Number.isNaN(precioNum) || precioNum < 0) return setError('Precio inválido');

    const body = {
      nombre: nombre.trim(),
      codigo: codigo.trim() || undefined,
      codigoBarras: codigoBarras.trim() || undefined,
      descripcion: descripcion.trim() || undefined,
      precioBase: precioNum,
      tasaIva,
      categoriaId: categoriaId || undefined,
      imagenUrl: imagenUrl.trim() || undefined,
      sectorComanda: sectorComanda || undefined,
      tiempoPrepSegundos: tiempoPrep ? Number.parseInt(tiempoPrep, 10) : undefined,
      esCombo,
      esVendible,
      esPreparacion,
    };

    try {
      let productoId: string;
      if (producto) {
        await actualizar.mutateAsync({ id: producto.id, ...body });
        productoId = producto.id;
      } else {
        const result = await crear.mutateAsync(body);
        productoId = result.producto.id;
      }

      // Si hay archivo nuevo seleccionado, lo subimos después del create/update
      if (archivoLocal) {
        try {
          await subirImagen.mutateAsync({ id: productoId, archivo: archivoLocal });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Error al subir imagen');
          // El producto se guardó OK; no bloqueamos la navegación.
        }
        descartarArchivoSeleccionado();
      }

      toast.success(producto ? 'Producto actualizado' : 'Producto creado');
      if (!producto) {
        router.push(`/productos/${productoId}`);
        return;
      }
      router.push('/productos');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar');
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="grid gap-6 lg:grid-cols-[1fr_320px]"
    >
      {/* ═══ Columna izquierda — datos principales ═══ */}
      <div className="space-y-4">
        <Section title="Datos básicos">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <Field label="Nombre" required>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Smash Clásica"
                autoFocus
              />
            </Field>
            <Field label="Código">
              <Input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="font-mono"
                placeholder="HAM-001"
              />
            </Field>
          </div>

          <Field label="Descripción">
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              placeholder="Medallón 130g, queso cheddar, lechuga, tomate..."
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Categoría">
              <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">— Sin categoría —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Código de barras">
              <Input
                value={codigoBarras}
                onChange={(e) => setCodigoBarras(e.target.value)}
                className="font-mono"
                placeholder="7790895001234"
              />
            </Field>
          </div>
        </Section>

        <Section title="Precio e IVA">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <Field
              label="Precio base (con IVA incluido)"
              required
              hint={
                !Number.isNaN(precioPreview) && precioBase ? formatGs(precioPreview) : undefined
              }
            >
              <Input
                type="text"
                inputMode="numeric"
                value={precioBase}
                onChange={(e) => setPrecioBase(e.target.value)}
                className="font-mono text-lg"
                placeholder="35000"
              />
            </Field>
            <Field label="Tasa IVA">
              <Select
                value={tasaIva}
                onChange={(e) => setTasaIva(e.target.value as (typeof TASAS)[number])}
              >
                {TASAS.map((t) => (
                  <option key={t} value={t}>
                    {t === 'EXENTO' ? 'Exento' : `${t.replace('IVA_', '')}%`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="Cocina">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sector de comanda">
              <Select value={sectorComanda} onChange={(e) => setSectorComanda(e.target.value)}>
                <option value="">— No aplica —</option>
                {SECTORES.map((s) => (
                  <option key={s} value={s}>
                    {s
                      .replace(/_/g, ' ')
                      .toLowerCase()
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tiempo de preparación (segundos)">
              <Input
                type="number"
                value={tiempoPrep}
                onChange={(e) => setTiempoPrep(e.target.value)}
                placeholder="480"
                min={0}
              />
            </Field>
          </div>
        </Section>

        {producto ? (
          <ProductoModificadoresSection producto={producto} />
        ) : (
          <section className="rounded-lg border border-dashed bg-muted/20 p-5 text-center text-xs text-muted-foreground">
            <Sliders className="mx-auto mb-2 h-5 w-5 opacity-40" />
            Guardá primero el producto para configurar modificadores
            <br />
            (ej: punto de cocción, extras, sabores).
          </section>
        )}
      </div>

      {/* ═══ Columna derecha — imagen + flags + acciones ═══ */}
      <div className="space-y-4">
        <Section title="Imagen">
          {imagenSrcActual && !imagenError ? (
            <img
              src={imagenSrcActual}
              alt={nombre || 'Producto'}
              className="mb-3 aspect-[4/3] w-full rounded-md border bg-muted object-cover"
              onError={() => setImagenError(true)}
              onLoad={() => setImagenError(false)}
            />
          ) : (
            <div className="mb-3 flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/30 text-xs text-muted-foreground">
              <ImageOff className="h-8 w-8 opacity-40" />
              {imagenError ? 'No se pudo cargar la imagen' : 'Sin imagen'}
            </div>
          )}

          <div className="space-y-2">
            <label
              className={cn(
                'flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed bg-muted/20 py-2 text-xs font-medium transition-colors',
                'hover:bg-muted/40',
              )}
            >
              <Upload className="h-3.5 w-3.5" />
              {archivoLocal ? archivoLocal.name : 'Subir imagen desde mi PC'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleArchivoChange}
              />
            </label>
            {archivoLocal && (
              <p className="text-[11px] text-muted-foreground">
                Archivo nuevo seleccionado — se subirá al guardar.{' '}
                <button
                  type="button"
                  onClick={descartarArchivoSeleccionado}
                  className="underline hover:text-foreground"
                >
                  descartar
                </button>
              </p>
            )}
            {tieneImagenSubida && !archivoLocal && (
              <button
                type="button"
                onClick={() => void handleEliminarImagenSubida()}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-destructive/30 py-1.5 text-[11px] text-destructive hover:bg-destructive/5"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar imagen subida
              </button>
            )}
          </div>

          <Field label="O usar URL externa" hint="Sólo se usa si no hay imagen subida">
            <Input
              type="url"
              value={imagenUrl}
              onChange={(e) => {
                setImagenUrl(e.target.value);
                setImagenError(false);
              }}
              className="text-xs"
              placeholder="https://images.unsplash.com/..."
            />
          </Field>
        </Section>

        <Section title="Flags">
          <div className="-my-1 divide-y">
            <SwitchField
              label="Es combo"
              description="Tiene grupos de opciones que el cliente elige"
              checked={esCombo}
              onCheckedChange={setEsCombo}
            />
            <SwitchField
              label="Es vendible"
              description="Visible en el POS para venta directa"
              checked={esVendible}
              onCheckedChange={setEsVendible}
            />
            <SwitchField
              label="Es sub-preparación"
              description="Insumo intermedio (ej: salsa) — no se vende directo"
              checked={esPreparacion}
              onCheckedChange={setEsPreparacion}
            />
          </div>
        </Section>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="sticky bottom-4 flex gap-2 rounded-lg border bg-card p-3 shadow-lg">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 rounded-md border border-input py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground transition-colors',
              'hover:bg-primary/90 disabled:opacity-60',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar
          </button>
        </div>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
