'use client';

import {
  ArrowLeft,
  ClipboardList,
  Loader2,
  Receipt,
  Store,
  Trash2,
  Truck,
  Utensils,
  User,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { toast } from '@/components/Toast';
import {
  type EstadoPedido,
  type PedidoDetalleItem,
  type TipoPedido,
  useCancelarItemPedido,
  usePedidoDetalle,
} from '@/hooks/usePedidos';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

const ROLES_CANCELAR_ITEM = ['GERENTE_SUCURSAL', 'ADMIN_EMPRESA', 'SUPER_ADMIN'];

export default function PedidoDetallePage() {
  return (
    <AuthGate>
      <AdminShell>
        <PedidoDetalleScreen />
      </AdminShell>
    </AuthGate>
  );
}

function PedidoDetalleScreen() {
  const { id } = useParams<{ id: string }>();
  const { data: pedido, isLoading, isError } = usePedidoDetalle(id);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !pedido) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        No se pudo cargar el pedido.{' '}
        <Link href="/pedidos" className="underline">
          Volver al listado
        </Link>
        .
      </div>
    );
  }

  const subtotal = BigInt(pedido.subtotal);
  const totalIva = BigInt(pedido.totalIva);
  const recargoDelivery = BigInt(pedido.recargoDelivery);
  const total = BigInt(pedido.total);

  // Cancelar ítems: solo gerente/admin y mientras el pedido no esté cerrado.
  const rol = useAuthStore((s) => s.user?.rol);
  const puedeCancelarItems =
    Boolean(rol && ROLES_CANCELAR_ITEM.includes(rol)) &&
    pedido.estado !== 'FACTURADO' &&
    pedido.estado !== 'CANCELADO';

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/pedidos"
            className="rounded-md border border-input p-2 text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <ClipboardList className="h-6 w-6 text-primary" />
              Pedido #{pedido.numero}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatFechaHora(pedido.createdAt)} · {pedido.items.length} ítem
              {pedido.items.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TipoBadge tipo={pedido.tipo} />
          <EstadoBadge estado={pedido.estado} />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Columna izquierda — items */}
        <section className="space-y-3">
          <div className="rounded-lg border bg-card">
            <h2 className="border-b px-4 py-3 text-sm font-bold uppercase tracking-wide">
              Ítems del pedido
            </h2>
            <ul className="divide-y">
              {pedido.items.map((it) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  pedidoId={pedido.id}
                  puedeCancelar={puedeCancelarItems}
                />
              ))}
            </ul>
            <div className="space-y-1 border-t bg-muted/20 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal (sin IVA)</span>
                <span className="font-mono tabular-nums">{formatGs(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA</span>
                <span className="font-mono tabular-nums">{formatGs(totalIva)}</span>
              </div>
              {recargoDelivery > 0n && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recargo delivery</span>
                  <span className="font-mono tabular-nums">+{formatGs(recargoDelivery)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 text-base font-bold">
                <span>Total</span>
                <span className="font-mono tabular-nums">{formatGs(total)}</span>
              </div>
            </div>
          </div>

          {pedido.observaciones && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                Observaciones del pedido
              </p>
              <p className="mt-1 italic text-amber-900 dark:text-amber-100">
                {pedido.observaciones}
              </p>
            </div>
          )}
        </section>

        {/* Columna derecha — datos contextuales */}
        <aside className="space-y-3">
          <DatosCard pedido={pedido} />
          <CronologiaCard pedido={pedido} />
        </aside>
      </div>
    </div>
  );
}

// ───── Items ─────

function ItemRow({
  item,
  pedidoId,
  puedeCancelar,
}: {
  item: PedidoDetalleItem;
  pedidoId: string;
  puedeCancelar: boolean;
}) {
  const [mostrarMotivo, setMostrarMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const cancelarItem = useCancelarItemPedido();

  const cancelado = item.estado === 'CANCELADO';
  const puedeAccionar = puedeCancelar && !cancelado;

  async function confirmarCancelacion() {
    const m = motivo.trim();
    if (m.length < 3) {
      toast.error('El motivo debe tener al menos 3 caracteres');
      return;
    }
    try {
      await cancelarItem.mutateAsync({ pedidoId, itemId: item.id, motivo: m });
      toast.success('Ítem cancelado');
      setMostrarMotivo(false);
      setMotivo('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cancelar el ítem');
    }
  }

  // Mods agrupados: globales del item + por componente del combo
  const modsGlobal = item.modificadores.filter((m) => !m.comboGrupo);
  const modsPorComponente = new Map<string, typeof item.modificadores>();
  for (const m of item.modificadores) {
    if (m.comboGrupo) {
      const arr = modsPorComponente.get(m.comboGrupo.id) ?? [];
      arr.push(m);
      modsPorComponente.set(m.comboGrupo.id, arr);
    }
  }

  return (
    <li className={cn('px-4 py-3', cancelado && 'opacity-50')}>
      <div className="flex items-start gap-3">
        <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-base font-bold tabular-nums text-primary">
          {item.cantidad}×
        </span>
        <div className="flex-1">
          <p className={cn('font-semibold', cancelado && 'line-through')}>
            {item.productoVenta.nombre}
            {cancelado && (
              <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-900 dark:bg-red-950/40 dark:text-red-200">
                Cancelado
              </span>
            )}
          </p>
          {item.productoVenta.codigo && (
            <p className="text-[11px] text-muted-foreground">{item.productoVenta.codigo}</p>
          )}

          {/* Componentes del combo */}
          {item.combosOpcion.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-md border-l-2 border-blue-300 bg-blue-50/30 px-3 py-2 text-xs dark:border-blue-900/50 dark:bg-blue-950/10">
              {item.combosOpcion.map((co) => {
                const mods = modsPorComponente.get(co.comboGrupo.id) ?? [];
                return (
                  <li key={co.id}>
                    <p>
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {co.comboGrupo.nombre}:
                      </span>{' '}
                      <strong>{co.comboGrupoOpcion.productoVenta.nombre}</strong>
                    </p>
                    {mods.length > 0 && (
                      <ul className="ml-3 mt-0.5 text-[11px] text-amber-900 dark:text-amber-300">
                        {mods.map((m) => (
                          <li key={m.id}>+ {m.modificadorOpcion.nombre}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Mods globales del item (productos sueltos o que aplican al combo entero) */}
          {modsGlobal.length > 0 && (
            <ul className="mt-1 text-[11px] text-amber-900 dark:text-amber-300">
              {modsGlobal.map((m) => (
                <li key={m.id}>+ {m.modificadorOpcion.nombre}</li>
              ))}
            </ul>
          )}

          {item.observaciones && (
            <p className="mt-1 text-[11px] italic text-muted-foreground">⚠ {item.observaciones}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="font-mono text-sm font-semibold tabular-nums">{formatGs(item.subtotal)}</p>
          {puedeAccionar && !mostrarMotivo && (
            <button
              type="button"
              onClick={() => setMostrarMotivo(true)}
              className="flex items-center gap-1 rounded-md border border-red-300 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-3 w-3" /> Cancelar
            </button>
          )}
        </div>
      </div>

      {puedeAccionar && mostrarMotivo && (
        <div className="mt-3 space-y-2 rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-red-800 dark:text-red-200">
              Cancelar este ítem (se revierte el stock)
            </p>
            <button
              type="button"
              onClick={() => {
                setMostrarMotivo(false);
                setMotivo('');
              }}
              className="rounded-sm p-0.5 hover:bg-red-100 dark:hover:bg-red-950/40"
              aria-label="Cerrar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Motivo de la cancelación (ej: cliente cambió de opinión)"
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                void confirmarCancelacion();
              }}
              disabled={cancelarItem.isPending || motivo.trim().length < 3}
              className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white shadow hover:bg-red-700 disabled:opacity-50"
            >
              {cancelarItem.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Confirmar cancelación
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ───── Cards laterales ─────

function DatosCard({
  pedido,
}: {
  pedido: {
    tipo: TipoPedido;
    mesa: { numero: number } | null;
    cliente: { razonSocial: string; ruc: string | null; dv: string | null } | null;
    tomadoPor: { nombreCompleto: string } | null;
    numeroPager: number | null;
  };
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Datos</h2>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Tipo</dt>
          <dd>
            <TipoBadge tipo={pedido.tipo} />
          </dd>
        </div>
        {pedido.mesa && (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Mesa</dt>
            <dd className="font-semibold">#{pedido.mesa.numero}</dd>
          </div>
        )}
        {pedido.cliente && (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <User className="inline h-3 w-3" /> Cliente
            </dt>
            <dd className="font-semibold">{pedido.cliente.razonSocial}</dd>
            {pedido.cliente.ruc && (
              <dd className="text-[11px] text-muted-foreground">
                RUC {pedido.cliente.ruc}-{pedido.cliente.dv}
              </dd>
            )}
          </div>
        )}
        {pedido.tomadoPor && (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Cajero/a</dt>
            <dd>{pedido.tomadoPor.nombreCompleto}</dd>
          </div>
        )}
        {pedido.numeroPager != null && (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Pager</dt>
            <dd className="text-base font-bold">#{pedido.numeroPager}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function CronologiaCard({
  pedido,
}: {
  pedido: {
    createdAt: string;
    confirmadoEn: string | null;
    enPreparacionEn: string | null;
    listoEn: string | null;
    entregadoEn: string | null;
    facturadoEn: string | null;
    canceladoEn: string | null;
  };
}) {
  const eventos = [
    { label: 'Creado', ts: pedido.createdAt },
    { label: 'Confirmado', ts: pedido.confirmadoEn },
    { label: 'En preparación', ts: pedido.enPreparacionEn },
    { label: 'Listo', ts: pedido.listoEn },
    { label: 'Entregado', ts: pedido.entregadoEn },
    { label: 'Facturado', ts: pedido.facturadoEn },
    { label: 'Cancelado', ts: pedido.canceladoEn },
  ].filter((e) => e.ts !== null) as { label: string; ts: string }[];

  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Cronología</h2>
      <ol className="relative space-y-3 border-l-2 border-muted pl-4">
        {eventos.map((e) => (
          <li key={e.label}>
            <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-primary" />
            <p className="text-xs font-semibold">{e.label}</p>
            <p className="text-[11px] text-muted-foreground">{formatFechaHora(e.ts)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ───── Badges ─────

function TipoBadge({ tipo }: { tipo: TipoPedido }) {
  const config: Record<TipoPedido, { icon: typeof Store; label: string; className: string }> = {
    MOSTRADOR: { icon: Store, label: 'Mostrador', className: 'bg-blue-100 text-blue-900' },
    MESA: { icon: Utensils, label: 'Mesa', className: 'bg-purple-100 text-purple-900' },
    DELIVERY_PROPIO: { icon: Truck, label: 'Delivery', className: 'bg-amber-100 text-amber-900' },
    DELIVERY_PEDIDOSYA: { icon: Truck, label: 'PedidosYa', className: 'bg-pink-100 text-pink-900' },
    RETIRO_LOCAL: { icon: Receipt, label: 'Retiro', className: 'bg-slate-100 text-slate-900' },
  };
  const c = config[tipo];
  const Icon = c.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
        c.className,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {c.label}
    </span>
  );
}

function EstadoBadge({ estado }: { estado: EstadoPedido }) {
  const map: Record<EstadoPedido, { label: string; className: string }> = {
    PENDIENTE: { label: 'Pendiente', className: 'bg-slate-100 text-slate-900' },
    CONFIRMADO: { label: 'Confirmado', className: 'bg-blue-100 text-blue-900' },
    EN_PREPARACION: { label: 'En prep.', className: 'bg-amber-100 text-amber-900' },
    LISTO: { label: 'Listo', className: 'bg-emerald-100 text-emerald-900' },
    EN_CAMINO: { label: 'En camino', className: 'bg-sky-100 text-sky-900' },
    ENTREGADO: { label: 'Entregado', className: 'bg-teal-100 text-teal-900' },
    FACTURADO: { label: 'Facturado', className: 'bg-emerald-200 text-emerald-900' },
    CANCELADO: { label: 'Cancelado', className: 'bg-red-100 text-red-900 line-through' },
  };
  const c = map[estado];
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
        c.className,
      )}
    >
      {c.label}
    </span>
  );
}

// ───── Helpers ─────

function formatGs(n: string | bigint): string {
  return `Gs. ${BigInt(n).toLocaleString('es-PY')}`;
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
