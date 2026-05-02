'use client';

import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { toast } from '@/components/Toast';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { useCrearCompra } from '@/hooks/useCompras';
import { useInsumos } from '@/hooks/useInventario';
import { useProveedores } from '@/hooks/useProveedores';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { formatGs } from '@/lib/utils';

const ROLES_ADMIN = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN'] as const;

interface ItemDraft {
  key: string;
  productoInventarioId: string;
  cantidad: string;
  costoUnitario: string;
}

export default function NuevaCompraPage() {
  return (
    <AuthGate roles={ROLES_ADMIN}>
      <AdminShell>
        <NuevaCompraScreen />
      </AdminShell>
    </AuthGate>
  );
}

function NuevaCompraScreen() {
  const router = useRouter();
  const sucursales = useAuthStore((s) => s.user?.sucursales ?? []);
  const sucursalActivaId = useAuthStore((s) => s.user?.sucursalActivaId ?? null);

  const { data: proveedores = [] } = useProveedores();
  const { data: insumosData } = useInsumos();
  const insumos = insumosData?.insumos ?? [];
  const crear = useCrearCompra();

  const [proveedorId, setProveedorId] = useState('');
  const [sucursalId, setSucursalId] = useState(sucursalActivaId ?? sucursales[0]?.id ?? '');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [numeroFactura, setNumeroFactura] = useState('');
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([
    { key: crypto.randomUUID(), productoInventarioId: '', cantidad: '', costoUnitario: '' },
  ]);
  const [error, setError] = useState<string | null>(null);

  const proveedoresActivos = useMemo(() => proveedores.filter((p) => p.activo), [proveedores]);
  const insumosActivos = useMemo(() => insumos.filter((i) => i.activo), [insumos]);

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [
      ...prev,
      { key: crypto.randomUUID(), productoInventarioId: '', cantidad: '', costoUnitario: '' },
    ]);
  }
  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  const total = items.reduce((sum, it) => {
    const c = Number.parseFloat(it.cantidad);
    const cu = Number.parseInt(it.costoUnitario, 10);
    if (Number.isNaN(c) || Number.isNaN(cu)) return sum;
    return sum + Math.round(c * cu);
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!proveedorId) return setError('Seleccioná un proveedor');
    if (!sucursalId) return setError('Seleccioná una sucursal');

    const itemsValidados: {
      productoInventarioId: string;
      cantidad: number;
      costoUnitario: number;
    }[] = [];
    for (const it of items) {
      if (!it.productoInventarioId)
        return setError('Todos los items deben tener insumo seleccionado');
      const cant = Number.parseFloat(it.cantidad);
      if (Number.isNaN(cant) || cant <= 0)
        return setError('Cantidad debe ser > 0 en todos los items');
      const costo = Number.parseInt(it.costoUnitario, 10);
      if (Number.isNaN(costo) || costo < 0) return setError('Costo unitario debe ser ≥ 0');
      itemsValidados.push({
        productoInventarioId: it.productoInventarioId,
        cantidad: cant,
        costoUnitario: costo,
      });
    }
    // Detectar duplicados
    const ids = itemsValidados.map((i) => i.productoInventarioId);
    if (new Set(ids).size !== ids.length) {
      return setError('Hay insumos duplicados — agrupalos en un solo item');
    }

    try {
      const result = await crear.mutateAsync({
        proveedorId,
        sucursalId,
        fecha: new Date(fecha).toISOString(),
        numeroFactura: numeroFactura.trim() || undefined,
        notas: notas.trim() || undefined,
        items: itemsValidados,
      });
      toast.success(`Compra #${result.compra.numero} registrada — stock actualizado`);
      router.push(`/compras/${result.compra.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al registrar compra');
    }
  }

  return (
    <div>
      <header className="mb-5">
        <Link
          href="/compras"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver al listado
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Nueva compra</h1>
        <p className="text-sm text-muted-foreground">
          Al guardar, los insumos ingresan automáticamente al stock de la sucursal seleccionada.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="space-y-6"
      >
        {/* Header de compra */}
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Datos generales
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Proveedor" required>
              <Select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                <option value="">— Elegí un proveedor —</option>
                {proveedoresActivos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.razonSocial}
                    {p.ruc ? ` (RUC ${p.ruc}-${p.dv ?? ''})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sucursal de ingreso" required>
              <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
                {sucursales.length === 0 && <option value="">Sin sucursales</option>}
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} ({s.codigo})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha" required>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Field label="N° factura del proveedor" hint="Opcional pero recomendado">
              <Input
                value={numeroFactura}
                onChange={(e) => setNumeroFactura(e.target.value)}
                placeholder="ej: 001-001-0000123"
                maxLength={50}
              />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Notas">
              <Textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="ej: incluye flete, condición a 30 días"
              />
            </Field>
          </div>
        </section>

        {/* Items */}
        <section className="rounded-lg border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Items ({items.length})
            </h2>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Insumo</th>
                  <th className="px-3 py-2 text-right font-semibold">Cantidad</th>
                  <th className="px-3 py-2 text-right font-semibold">Costo unit.</th>
                  <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((it) => {
                  const insumo = insumos.find((i) => i.id === it.productoInventarioId);
                  const cant = Number.parseFloat(it.cantidad);
                  const cu = Number.parseInt(it.costoUnitario, 10);
                  const subtotal =
                    !Number.isNaN(cant) && !Number.isNaN(cu) ? Math.round(cant * cu) : 0;
                  return (
                    <tr key={it.key}>
                      <td className="px-3 py-2 align-top">
                        <Select
                          value={it.productoInventarioId}
                          onChange={(e) =>
                            updateItem(it.key, { productoInventarioId: e.target.value })
                          }
                          className="text-xs"
                        >
                          <option value="">— Elegí insumo —</option>
                          {insumosActivos.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.nombre} ({i.unidadMedida})
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="w-[150px] px-3 py-2 align-top">
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          value={it.cantidad}
                          onChange={(e) => updateItem(it.key, { cantidad: e.target.value })}
                          className="text-right text-xs"
                          placeholder={insumo ? insumo.unidadMedida : '0'}
                        />
                      </td>
                      <td className="w-[160px] px-3 py-2 align-top">
                        <Input
                          type="number"
                          min="0"
                          value={it.costoUnitario}
                          onChange={(e) => updateItem(it.key, { costoUnitario: e.target.value })}
                          className="text-right text-xs"
                          placeholder="0"
                        />
                      </td>
                      <td className="w-[140px] px-3 py-2 text-right align-top font-mono text-xs">
                        {subtotal > 0 ? formatGs(subtotal) : '—'}
                      </td>
                      <td className="w-[40px] px-2 py-2 align-top">
                        <button
                          type="button"
                          onClick={() => removeItem(it.key)}
                          disabled={items.length === 1}
                          className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label="Eliminar item"
                          title={
                            items.length === 1 ? 'Debe haber al menos un item' : 'Eliminar item'
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/30">
                  <td colSpan={3} className="px-3 py-2.5 text-right text-sm font-semibold">
                    Total compra:
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-base font-bold">
                    {formatGs(total)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Link
            href="/compras"
            className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={crear.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {crear.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Registrar compra
          </button>
        </div>
      </form>
    </div>
  );
}
