'use client';

import {
  ArrowLeft,
  ClipboardList,
  Loader2,
  Receipt,
  Store,
  Truck,
  Utensils,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import {
  type EstadoPedido,
  type PedidoDetalleItem,
  type TipoPedido,
  usePedidoDetalle,
} from '@/hooks/usePedidos';
import { cn } from '@/lib/utils';

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
  const total = BigInt(pedido.total);

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
                <ItemRow key={it.id} item={it} />
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

function ItemRow({ item }: { item: PedidoDetalleItem }) {
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
    <li className={cn('px-4 py-3', item.estado === 'CANCELADO' && 'opacity-50')}>
      <div className="flex items-start gap-3">
        <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-base font-bold tabular-nums text-primary">
          {item.cantidad}×
        </span>
        <div className="flex-1">
          <p className="font-semibold">{item.productoVenta.nombre}</p>
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
        <p className="shrink-0 font-mono text-sm font-semibold tabular-nums">
          {formatGs(item.subtotal)}
        </p>
      </div>
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
