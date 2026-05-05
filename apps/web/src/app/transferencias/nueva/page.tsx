'use client';

import { ArrowLeft, ArrowRight, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { toast } from '@/components/Toast';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { useInsumos } from '@/hooks/useInventario';
import { useCrearTransferencia } from '@/hooks/useTransferencias';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { localId } from '@/lib/utils';

interface ItemDraft {
  key: string;
  productoInventarioId: string;
  cantidad: string;
}

export default function NuevaTransferenciaPage() {
  return (
    <AuthGate>
      <AdminShell>
        <NuevaTransferenciaScreen />
      </AdminShell>
    </AuthGate>
  );
}

function NuevaTransferenciaScreen() {
  const router = useRouter();
  const sucursales = useAuthStore((s) => s.user?.sucursales ?? []);
  const sucursalActivaId = useAuthStore((s) => s.user?.sucursalActivaId ?? null);

  const { data: insumosData } = useInsumos();
  const insumos = insumosData?.insumos ?? [];
  const crear = useCrearTransferencia();

  const [sucursalOrigenId, setSucursalOrigenId] = useState(
    sucursalActivaId ?? sucursales[0]?.id ?? '',
  );
  const [sucursalDestinoId, setSucursalDestinoId] = useState('');
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([
    { key: localId(), productoInventarioId: '', cantidad: '' },
  ]);
  const [error, setError] = useState<string | null>(null);

  const sucursalesDestino = useMemo(
    () => sucursales.filter((s) => s.id !== sucursalOrigenId),
    [sucursales, sucursalOrigenId],
  );
  const insumosActivos = useMemo(() => insumos.filter((i) => i.activo), [insumos]);

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { key: localId(), productoInventarioId: '', cantidad: '' }]);
  }
  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sucursalOrigenId) return setError('Seleccioná la sucursal de origen');
    if (!sucursalDestinoId) return setError('Seleccioná la sucursal de destino');
    if (sucursalOrigenId === sucursalDestinoId) {
      return setError('Origen y destino deben ser distintas');
    }

    const itemsValidados: { productoInventarioId: string; cantidad: number }[] = [];
    for (const it of items) {
      if (!it.productoInventarioId) return setError('Todos los items deben tener insumo');
      const cant = Number.parseFloat(it.cantidad);
      if (Number.isNaN(cant) || cant <= 0) return setError('Cantidad debe ser > 0');
      itemsValidados.push({ productoInventarioId: it.productoInventarioId, cantidad: cant });
    }
    const ids = itemsValidados.map((i) => i.productoInventarioId);
    if (new Set(ids).size !== ids.length) {
      return setError('Hay insumos duplicados — agrupalos en un solo item');
    }

    try {
      const result = await crear.mutateAsync({
        sucursalOrigenId,
        sucursalDestinoId,
        notas: notas.trim() || undefined,
        items: itemsValidados,
      });
      toast.success(`Transferencia #${result.transferencia.numero} registrada — stock actualizado`);
      router.push(`/transferencias/${result.transferencia.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al registrar transferencia');
    }
  }

  const sucOrigenNombre = sucursales.find((s) => s.id === sucursalOrigenId)?.nombre;
  const sucDestinoNombre = sucursales.find((s) => s.id === sucursalDestinoId)?.nombre;

  return (
    <div>
      <header className="mb-5">
        <Link
          href="/transferencias"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver al listado
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Nueva transferencia</h1>
        <p className="text-sm text-muted-foreground">
          Al guardar, el stock se descuenta del origen y se suma al destino atómicamente.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="space-y-6"
      >
        {/* Origen → Destino */}
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Movimiento
          </h2>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <Field label="Sucursal origen" required hint="Desde donde sale el stock">
              <Select
                value={sucursalOrigenId}
                onChange={(e) => setSucursalOrigenId(e.target.value)}
              >
                <option value="">— Origen —</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} ({s.codigo})
                  </option>
                ))}
              </Select>
            </Field>
            <div className="hidden sm:block">
              <ArrowRight className="mb-2.5 h-5 w-5 text-muted-foreground" />
            </div>
            <Field label="Sucursal destino" required hint="A donde ingresa">
              <Select
                value={sucursalDestinoId}
                onChange={(e) => setSucursalDestinoId(e.target.value)}
              >
                <option value="">— Destino —</option>
                {sucursalesDestino.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} ({s.codigo})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {sucOrigenNombre && sucDestinoNombre && (
            <p className="mt-3 rounded-md bg-muted/30 p-2.5 text-xs">
              <strong>{sucOrigenNombre}</strong> → <strong>{sucDestinoNombre}</strong> · El stock se
              moverá inmediatamente.
            </p>
          )}
          <div className="mt-3">
            <Field label="Notas">
              <Textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="ej: reposición semanal, ajuste por alta demanda..."
              />
            </Field>
          </div>
        </section>

        {/* Items */}
        <section className="rounded-lg border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Insumos a transferir ({items.length})
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
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((it) => {
                  const insumo = insumos.find((i) => i.id === it.productoInventarioId);
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
                      <td className="w-[180px] px-3 py-2 align-top">
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
                      <td className="w-[40px] px-2 py-2 align-top">
                        <button
                          type="button"
                          onClick={() => removeItem(it.key)}
                          disabled={items.length === 1}
                          className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label="Eliminar item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
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
            href="/transferencias"
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
            Registrar transferencia
          </button>
        </div>
      </form>
    </div>
  );
}
