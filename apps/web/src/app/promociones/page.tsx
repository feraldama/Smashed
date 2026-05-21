'use client';

import {
  Calendar,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { confirmar, toast } from '@/components/Toast';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import { useProductos } from '@/hooks/useCatalogo';
import {
  type FiltroPromociones,
  type Promocion,
  type PromocionInput,
  type TipoPromocion,
  useActualizarPromocion,
  useCrearPromocion,
  useEliminarPromocion,
  usePromociones,
} from '@/hooks/usePromociones';
import { useSucursales } from '@/hooks/useSucursales';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const DIAS_SEMANA = [
  { num: 0, corto: 'Dom', label: 'Domingo' },
  { num: 1, corto: 'Lun', label: 'Lunes' },
  { num: 2, corto: 'Mar', label: 'Martes' },
  { num: 3, corto: 'Mié', label: 'Miércoles' },
  { num: 4, corto: 'Jue', label: 'Jueves' },
  { num: 5, corto: 'Vie', label: 'Viernes' },
  { num: 6, corto: 'Sáb', label: 'Sábado' },
] as const;

const TIPOS_LABEL: Record<TipoPromocion, string> = {
  PRECIO_FIJO: 'Precio fijo',
  PORCENTAJE: '% descuento',
  NXM: 'Lleva N paga M',
  COMBO: 'Combo',
};

export default function PromocionesPage() {
  return (
    <AuthGate>
      <AdminShell>
        <PromocionesScreen />
      </AdminShell>
    </AuthGate>
  );
}

function PromocionesScreen() {
  const [filtro, setFiltro] = useState<FiltroPromociones>('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const { data: promos = [], isLoading } = usePromociones(filtro, busqueda || undefined);
  const [editando, setEditando] = useState<Promocion | 'NEW' | null>(null);

  return (
    <div>
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sparkles className="h-6 w-6 text-primary" /> Promociones
        </h1>
        <p className="text-sm text-muted-foreground">
          Configurá ofertas que aparezcan en el POS sólo los días y horarios habilitados (ej. martes
          2x1 de chopp 18-21h, happy hour, combos especiales).
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border">
            {(['TODAS', 'ACTIVAS', 'INACTIVAS'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={cn(
                  'px-3 py-2 text-xs font-medium transition-colors',
                  filtro === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent',
                )}
              >
                {f === 'TODAS' ? 'Todas' : f === 'ACTIVAS' ? 'Activas' : 'Inactivas'}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-56 pl-7"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditando('NEW')}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nueva promoción
        </button>
      </div>

      {isLoading ? (
        <Cargando />
      ) : promos.length === 0 ? (
        <Vacio
          mensaje={
            busqueda
              ? 'No se encontraron promociones con ese nombre.'
              : 'Todavía no hay promociones. Creá una (ej. "Martes 2x1 chopp 18-21h").'
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {promos.map((p) => (
            <PromocionRow key={p.id} promo={p} onEditar={() => setEditando(p)} />
          ))}
        </ul>
      )}

      {editando && (
        <PromocionFormModal
          promo={editando === 'NEW' ? undefined : editando}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function PromocionRow({ promo, onEditar }: { promo: Promocion; onEditar: () => void }) {
  const diasLabel = useMemo(() => {
    if (promo.diasSemana.length === 0) return 'todos los días';
    return promo.diasSemana
      .slice()
      .sort()
      .map((d) => DIAS_SEMANA.find((x) => x.num === d)?.corto ?? '?')
      .join(', ');
  }, [promo.diasSemana]);

  const horario =
    promo.horaInicio && promo.horaFin
      ? `${promo.horaInicio}–${promo.horaFin}`
      : promo.horaInicio
        ? `desde ${promo.horaInicio}`
        : promo.horaFin
          ? `hasta ${promo.horaFin}`
          : 'todo el día';

  const detalle = useMemo(() => {
    switch (promo.tipo) {
      case 'PRECIO_FIJO':
        return `Gs. ${formatMiles(promo.precioFijo)}`;
      case 'PORCENTAJE':
        return promo.porcentaje != null ? `${(promo.porcentaje / 100).toFixed(2)}% off` : '';
      case 'NXM':
        return `${promo.nxmLleva}x${promo.nxmPaga}`;
      case 'COMBO':
        return `Combo Gs. ${formatMiles(promo.precioFijo)}`;
    }
  }, [promo]);

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="text-xl">{promo.iconoEmoji ?? '✨'}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 font-medium">
          {promo.nombre}
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {TIPOS_LABEL[promo.tipo]}
          </span>
          {!promo.activo && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Inactiva
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono font-semibold">{detalle}</span> ·{' '}
          <Calendar className="inline h-3 w-3" /> {diasLabel} · <Clock className="inline h-3 w-3" />{' '}
          {horario} · {promo.productos.length} producto{promo.productos.length !== 1 ? 's' : ''} ·{' '}
          {promo.sucursales.length === 0
            ? 'todas las sucursales'
            : `${promo.sucursales.length} sucursal${promo.sucursales.length !== 1 ? 'es' : ''}`}
        </p>
      </div>
      <button
        type="button"
        onClick={onEditar}
        className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Editar"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

function PromocionFormModal({ promo, onClose }: { promo?: Promocion; onClose: () => void }) {
  const crear = useCrearPromocion();
  const actualizar = useActualizarPromocion();
  const eliminar = useEliminarPromocion();
  const { data: productos = [] } = useProductos({ incluirNoVendibles: false });
  const { data: sucursales = [] } = useSucursales();

  const isEdit = Boolean(promo);
  const isPending = crear.isPending || actualizar.isPending || eliminar.isPending;

  // ───── Estado del form ─────
  const [nombre, setNombre] = useState(promo?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(promo?.descripcion ?? '');
  const [tipo, setTipo] = useState<TipoPromocion>(promo?.tipo ?? 'PRECIO_FIJO');
  const [precioFijo, setPrecioFijo] = useState(promo?.precioFijo ?? '');
  // Porcentaje a UI: backend lo guarda en centésimos del 1% (1500 = 15.00%).
  const [porcentajeUI, setPorcentajeUI] = useState(
    promo?.porcentaje != null ? (promo.porcentaje / 100).toString() : '',
  );
  const [nxmLleva, setNxmLleva] = useState(promo?.nxmLleva?.toString() ?? '2');
  const [nxmPaga, setNxmPaga] = useState(promo?.nxmPaga?.toString() ?? '1');

  const [vigenciaDesde, setVigenciaDesde] = useState(
    promo?.vigenciaDesde ? promo.vigenciaDesde.slice(0, 10) : '',
  );
  const [vigenciaHasta, setVigenciaHasta] = useState(
    promo?.vigenciaHasta ? promo.vigenciaHasta.slice(0, 10) : '',
  );
  const [diasSemana, setDiasSemana] = useState<number[]>(promo?.diasSemana ?? []);
  const [horaInicio, setHoraInicio] = useState(promo?.horaInicio ?? '');
  const [horaFin, setHoraFin] = useState(promo?.horaFin ?? '');
  const [activo, setActivo] = useState(promo?.activo ?? true);
  const [iconoEmoji, setIconoEmoji] = useState(promo?.iconoEmoji ?? '✨');
  const [ordenMenu, setOrdenMenu] = useState(promo?.ordenMenu?.toString() ?? '0');
  const [productosSel, setProductosSel] = useState<
    Array<{ productoVentaId: string; cantidadMin: number }>
  >(
    promo?.productos.map((p) => ({
      productoVentaId: p.productoVentaId,
      cantidadMin: p.cantidadMin,
    })) ?? [],
  );
  const [sucursalIds, setSucursalIds] = useState<string[]>(
    promo?.sucursales.map((s) => s.sucursalId) ?? [],
  );
  const [busquedaProd, setBusquedaProd] = useState('');
  const [error, setError] = useState<string | null>(null);

  const productosFiltrados = useMemo(() => {
    const q = busquedaProd.trim().toLowerCase();
    if (!q) return productos.slice(0, 20);
    return productos
      .filter(
        (p) => p.nombre.toLowerCase().includes(q) || (p.codigo ?? '').toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [productos, busquedaProd]);

  const productosSelMap = useMemo(() => {
    return new Map(productosSel.map((p) => [p.productoVentaId, p.cantidadMin]));
  }, [productosSel]);

  function toggleProducto(id: string) {
    setProductosSel((prev) =>
      prev.some((p) => p.productoVentaId === id)
        ? prev.filter((p) => p.productoVentaId !== id)
        : [...prev, { productoVentaId: id, cantidadMin: 1 }],
    );
  }

  function setCantidadMin(id: string, qty: number) {
    setProductosSel((prev) =>
      prev.map((p) => (p.productoVentaId === id ? { ...p, cantidadMin: Math.max(1, qty) } : p)),
    );
  }

  function toggleDia(d: number) {
    setDiasSemana((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  function toggleSucursal(id: string) {
    setSucursalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nombre.trim()) return setError('Nombre requerido');
    if (productosSel.length === 0) return setError('Agregá al menos un producto');
    if (tipo === 'COMBO' && productosSel.length < 2) {
      return setError('Un combo necesita al menos 2 productos');
    }

    // Construir payload normalizado por tipo.
    const input: PromocionInput = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      tipo,
      precioFijo: tipo === 'PRECIO_FIJO' || tipo === 'COMBO' ? parseEntero(precioFijo) : null,
      porcentaje: tipo === 'PORCENTAJE' ? Math.round(parseFloat(porcentajeUI) * 100) : null,
      nxmLleva: tipo === 'NXM' ? parseEntero(nxmLleva) : null,
      nxmPaga: tipo === 'NXM' ? parseEntero(nxmPaga) : null,
      vigenciaDesde: vigenciaDesde ? new Date(vigenciaDesde + 'T00:00:00').toISOString() : null,
      vigenciaHasta: vigenciaHasta ? new Date(vigenciaHasta + 'T23:59:59').toISOString() : null,
      diasSemana,
      horaInicio: horaInicio || null,
      horaFin: horaFin || null,
      activo,
      iconoEmoji: iconoEmoji.trim() || null,
      ordenMenu: parseEntero(ordenMenu) ?? 0,
      productos: productosSel,
      sucursalIds,
    };

    // Validación local por tipo (espejo del backend).
    if (
      (tipo === 'PRECIO_FIJO' || tipo === 'COMBO') &&
      (!input.precioFijo || input.precioFijo <= 0)
    ) {
      return setError('Ingresá un precio fijo válido (> 0)');
    }
    if (tipo === 'PORCENTAJE' && (!input.porcentaje || input.porcentaje <= 0)) {
      return setError('Ingresá un porcentaje válido (> 0)');
    }
    if (tipo === 'NXM') {
      if (!input.nxmLleva || !input.nxmPaga) return setError('Completá lleva y paga');
      if (input.nxmPaga >= input.nxmLleva) return setError('"paga" debe ser menor que "lleva"');
    }
    if (horaInicio && horaFin && horaInicio >= horaFin) {
      return setError('La hora de fin debe ser posterior a la de inicio');
    }

    try {
      if (promo) {
        await actualizar.mutateAsync({ id: promo.id, ...input });
        toast.success('Promoción actualizada');
      } else {
        await crear.mutateAsync(input);
        toast.success('Promoción creada');
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar');
    }
  }

  async function handleEliminar() {
    if (!promo) return;
    const ok = await confirmar({
      titulo: 'Eliminar promoción',
      mensaje: `¿Eliminar "${promo.nombre}"? Los pedidos históricos que la usaron no se ven afectados.`,
      destructivo: true,
      textoConfirmar: 'Eliminar',
    });
    if (!ok) return;
    try {
      await eliminar.mutateAsync(promo.id);
      toast.success('Promoción eliminada');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al eliminar');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">
            {isEdit ? 'Editar promoción' : 'Nueva promoción'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
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
            {/* ───── Datos básicos ───── */}
            <section className="grid grid-cols-2 gap-3">
              <Field label="Nombre" required>
                <Input
                  autoFocus
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  maxLength={100}
                  placeholder="Martes de chopp"
                />
              </Field>
              <Field label="Icono (emoji)" hint="Aparece como pestaña en el POS">
                <Input
                  value={iconoEmoji}
                  onChange={(e) => setIconoEmoji(e.target.value)}
                  maxLength={8}
                  placeholder="🍺"
                />
              </Field>
              <div className="col-span-2">
                <Field label="Descripción">
                  <Textarea
                    value={descripcion ?? ''}
                    onChange={(e) => setDescripcion(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Detalle visible al staff. Opcional."
                  />
                </Field>
              </div>
            </section>

            {/* ───── Tipo y campos condicionales ───── */}
            <section className="rounded-md border bg-muted/20 p-4">
              <Field label="Tipo de promoción" required>
                <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoPromocion)}>
                  <option value="PRECIO_FIJO">Precio fijo (ej. chopp a Gs. 8.000)</option>
                  <option value="PORCENTAJE">% de descuento sobre el precio base</option>
                  <option value="NXM">Lleva N paga M (ej. 2x1)</option>
                  <option value="COMBO">Combo (varios productos a precio fijo)</option>
                </Select>
              </Field>

              <div className="mt-3 grid grid-cols-2 gap-3">
                {(tipo === 'PRECIO_FIJO' || tipo === 'COMBO') && (
                  <Field
                    label={tipo === 'COMBO' ? 'Precio del combo (Gs.)' : 'Precio promocional (Gs.)'}
                    required
                  >
                    <Input
                      type="number"
                      value={precioFijo}
                      onChange={(e) => setPrecioFijo(e.target.value)}
                      min={1}
                      placeholder="8000"
                    />
                  </Field>
                )}
                {tipo === 'PORCENTAJE' && (
                  <Field label="Porcentaje de descuento (%)" required hint="Ej: 15 → 15% off">
                    <Input
                      type="number"
                      step="0.01"
                      value={porcentajeUI}
                      onChange={(e) => setPorcentajeUI(e.target.value)}
                      min={0.01}
                      max={100}
                    />
                  </Field>
                )}
                {tipo === 'NXM' && (
                  <>
                    <Field label="Lleva" required>
                      <Input
                        type="number"
                        value={nxmLleva}
                        onChange={(e) => setNxmLleva(e.target.value)}
                        min={2}
                      />
                    </Field>
                    <Field label="Paga" required>
                      <Input
                        type="number"
                        value={nxmPaga}
                        onChange={(e) => setNxmPaga(e.target.value)}
                        min={1}
                      />
                    </Field>
                  </>
                )}
              </div>
            </section>

            {/* ───── Vigencia ───── */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Vigencia
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Desde (opcional)">
                  <Input
                    type="date"
                    value={vigenciaDesde}
                    onChange={(e) => setVigenciaDesde(e.target.value)}
                  />
                </Field>
                <Field label="Hasta (opcional)">
                  <Input
                    type="date"
                    value={vigenciaHasta}
                    onChange={(e) => setVigenciaHasta(e.target.value)}
                  />
                </Field>
              </div>
              <div className="mt-3">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Días de la semana
                  <span className="ml-1 text-[10px]">(vacío = todos los días)</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS_SEMANA.map((d) => (
                    <button
                      type="button"
                      key={d.num}
                      onClick={() => toggleDia(d.num)}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                        diasSemana.includes(d.num)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background hover:bg-accent',
                      )}
                    >
                      {d.corto}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Hora inicio" hint="Formato 24h. Vacío = todo el día.">
                  <Input
                    type="time"
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                  />
                </Field>
                <Field label="Hora fin">
                  <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
                </Field>
              </div>
            </section>

            {/* ───── Productos ───── */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Productos ({productosSel.length})
              </h3>
              {tipo === 'COMBO' && (
                <p className="mb-2 text-xs text-muted-foreground">
                  Para combos, ajustá la <strong>cantidad mínima</strong> de cada producto que
                  compone el combo (ej. 2 hamburguesas, 1 papas, 2 choops).
                </p>
              )}
              <div className="rounded-md border bg-background">
                <div className="relative border-b p-2">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar producto por nombre o código…"
                    value={busquedaProd}
                    onChange={(e) => setBusquedaProd(e.target.value)}
                    className="pl-7"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {productosFiltrados.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">Sin resultados.</p>
                  ) : (
                    <ul className="divide-y">
                      {productosFiltrados.map((p) => {
                        const seleccionado = productosSelMap.has(p.id);
                        const cantidadMin = productosSelMap.get(p.id) ?? 1;
                        return (
                          <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={seleccionado}
                              onChange={() => toggleProducto(p.id)}
                              className="h-4 w-4 cursor-pointer"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{p.nombre}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {p.codigo ?? '—'} · Gs. {formatMiles(p.precioBase)}
                              </p>
                            </div>
                            {seleccionado && tipo === 'COMBO' && (
                              <Input
                                type="number"
                                value={cantidadMin}
                                onChange={(e) =>
                                  setCantidadMin(p.id, Number.parseInt(e.target.value, 10) || 1)
                                }
                                min={1}
                                className="w-16"
                                title="Cantidad mínima en el combo"
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            {/* ───── Sucursales ───── */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sucursales
                <span className="ml-1 text-[10px] normal-case">(vacío = aplica a todas)</span>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {sucursales.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => toggleSucursal(s.id)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                      sucursalIds.includes(s.id)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-accent',
                    )}
                  >
                    {s.nombre}
                  </button>
                ))}
              </div>
            </section>

            {/* ───── Misc ───── */}
            <section className="grid grid-cols-2 gap-3">
              <Field label="Orden en POS" hint="Menor número aparece antes">
                <Input
                  type="number"
                  value={ordenMenu}
                  onChange={(e) => setOrdenMenu(e.target.value)}
                  min={0}
                />
              </Field>
              <div className="flex items-end">
                <SwitchField
                  label="Activa"
                  description="Si está apagada, no aparece en el POS aunque esté en horario"
                  checked={activo}
                  onCheckedChange={setActivo}
                />
              </div>
            </section>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t bg-muted/20 p-4">
            {isEdit ? (
              <button
                type="button"
                onClick={() => {
                  void handleEliminar();
                }}
                disabled={isPending}
                className="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="inline h-3.5 w-3.5" /> Eliminar
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
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
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════

function Cargando() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function Vacio({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
      {mensaje}
    </div>
  );
}

function formatMiles(n: string | null | undefined): string {
  if (n == null || n === '') return '—';
  const num = typeof n === 'string' ? Number(n) : n;
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString('es-PY');
}

function parseEntero(s: string | undefined | null): number | null {
  if (s == null || s === '') return null;
  const n = Number.parseInt(String(s), 10);
  return Number.isFinite(n) ? n : null;
}
