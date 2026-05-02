'use client';

import { ImageOff, Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import {
  type ProductoDetalle,
  useActualizarProducto,
  useCategorias,
  useCrearProducto,
} from '@/hooks/useCatalogo';
import { ApiError } from '@/lib/api';
import { cn, formatGs } from '@/lib/utils';

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
  const [sectorComanda, setSectorComanda] = useState<string>(producto?.sectorComanda ?? '');
  const [tiempoPrep, setTiempoPrep] = useState(
    producto?.tiempoPrepSegundos ? String(producto.tiempoPrepSegundos) : '',
  );
  const [esCombo, setEsCombo] = useState(producto?.esCombo ?? false);
  const [esVendible, setEsVendible] = useState(producto?.esVendible ?? true);
  const [esPreparacion, setEsPreparacion] = useState(producto?.esPreparacion ?? false);

  const [error, setError] = useState<string | null>(null);
  const isPending = crear.isPending || actualizar.isPending;

  const precioPreview = Number.parseInt(precioBase.replace(/[^\d]/g, ''), 10);

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
      if (producto) {
        await actualizar.mutateAsync({ id: producto.id, ...body });
        toast.success('Producto actualizado');
      } else {
        const result = await crear.mutateAsync(body);
        toast.success('Producto creado');
        router.push(`/productos/${result.producto.id}`);
        return;
      }
      router.push('/productos');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
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
      </div>

      {/* ═══ Columna derecha — imagen + flags + acciones ═══ */}
      <div className="space-y-4">
        <Section title="Imagen">
          {imagenUrl && !imagenError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagenUrl}
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
          <Field label="URL de imagen">
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
