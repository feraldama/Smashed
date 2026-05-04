'use client';

import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  Search,
  Store,
  Truck,
  Utensils,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { DateRangePicker, type DateRange } from '@/components/DateRangePicker';
import {
  type EstadoPedido,
  type PedidoListItem,
  type TipoPedido,
  usePedidosListado,
} from '@/hooks/usePedidos';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

const ESTADOS: { value: EstadoPedido | ''; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'CONFIRMADO', label: 'Confirmado' },
  { value: 'EN_PREPARACION', label: 'En preparación' },
  { value: 'LISTO', label: 'Listo' },
  { value: 'EN_CAMINO', label: 'En camino' },
  { value: 'ENTREGADO', label: 'Entregado' },
  { value: 'FACTURADO', label: 'Facturado' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

const TIPOS: { value: TipoPedido | ''; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  { value: 'MOSTRADOR', label: 'Mostrador' },
  { value: 'MESA', label: 'Mesa' },
  { value: 'DELIVERY_PROPIO', label: 'Delivery' },
  { value: 'DELIVERY_PEDIDOSYA', label: 'PedidosYa' },
  { value: 'RETIRO_LOCAL', label: 'Retiro local' },
];

export default function PedidosPage() {
  return (
    <AuthGate>
      <AdminShell>
        <PedidosScreen />
      </AdminShell>
    </AuthGate>
  );
}

function PedidosScreen() {
  const ahora = new Date();
  const hace7 = new Date();
  hace7.setDate(hace7.getDate() - 6);
  hace7.setHours(0, 0, 0, 0);

  const [rango, setRango] = useState<DateRange>({ desde: hace7, hasta: ahora });
  const [estado, setEstado] = useState<EstadoPedido | ''>('');
  const [tipo, setTipo] = useState<TipoPedido | ''>('');
  const [busqueda, setBusqueda] = useState('');
  const [page, setPage] = useState(1);

  // Cualquier cambio de filtros nos vuelve a la primera página.
  useEffect(() => {
    setPage(1);
  }, [estado, tipo, busqueda, rango]);

  const { data, isLoading, isFetching } = usePedidosListado({
    desde: rango.desde.toISOString(),
    hasta: rango.hasta.toISOString(),
    estado: estado || undefined,
    tipo: tipo || undefined,
    busqueda: busqueda.trim() || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const pedidos = data?.pedidos ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(page * PAGE_SIZE, total);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ClipboardList className="h-6 w-6 text-primary" />
            Pedidos
          </h1>
          <p className="text-sm text-muted-foreground">
            {total} pedido{total !== 1 ? 's' : ''} en el rango seleccionado
          </p>
        </div>
      </header>

      {/* Filtros */}
      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-3 lg:grid-cols-[1fr_180px_180px_240px]">
        <DateRangePicker value={rango} onChange={setRango} />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoPedido | '')}
          className="rounded-md border border-input bg-background px-2 py-2 text-sm"
        >
          {ESTADOS.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoPedido | '')}
          className="rounded-md border border-input bg-background px-2 py-2 text-sm"
        >
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nº de pedido o cliente…"
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : pedidos.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <ClipboardList className="mx-auto mb-2 h-8 w-8 opacity-30" />
          No hay pedidos con esos filtros.
        </div>
      ) : (
        <div
          className={cn('overflow-hidden rounded-lg border bg-card', isFetching && 'opacity-60')}
        >
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Cliente / Mesa</th>
                <th className="px-3 py-2 text-left">Cajero</th>
                <th className="px-3 py-2 text-center">Items</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pedidos.map((p) => (
                <PedidoRow key={p.id} pedido={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginador */}
      {total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {desde}–{hasta} de {total}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
              className="rounded-md border border-input p-1.5 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs">
              Página <strong>{page}</strong> de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              className="rounded-md border border-input p-1.5 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PedidoRow({ pedido }: { pedido: PedidoListItem }) {
  return (
    <tr className="hover:bg-muted/20">
      <td className="px-3 py-2 font-mono text-sm font-bold tabular-nums">#{pedido.numero}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {formatFechaHora(pedido.createdAt)}
      </td>
      <td className="px-3 py-2">
        <TipoBadge tipo={pedido.tipo} />
      </td>
      <td className="px-3 py-2 text-xs">
        {pedido.mesa ? (
          <span>Mesa {pedido.mesa.numero}</span>
        ) : pedido.cliente ? (
          <span className="font-medium">{pedido.cliente.razonSocial}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {pedido.tomadoPor?.nombreCompleto ?? '—'}
      </td>
      <td className="px-3 py-2 text-center text-xs">{pedido._count.items}</td>
      <td className="px-3 py-2 text-center">
        <EstadoBadge estado={pedido.estado} />
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          href={`/pedidos/${pedido.id}`}
          className="font-mono text-sm font-bold hover:underline"
        >
          Gs. {Number(pedido.total).toLocaleString('es-PY')}
        </Link>
      </td>
    </tr>
  );
}

function TipoBadge({ tipo }: { tipo: TipoPedido }) {
  const config: Record<TipoPedido, { icon: typeof Store; label: string; className: string }> = {
    MOSTRADOR: {
      icon: Store,
      label: 'Mostrador',
      className: 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200',
    },
    MESA: {
      icon: Utensils,
      label: 'Mesa',
      className: 'bg-purple-100 text-purple-900 dark:bg-purple-950/40 dark:text-purple-200',
    },
    DELIVERY_PROPIO: {
      icon: Truck,
      label: 'Delivery',
      className: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
    },
    DELIVERY_PEDIDOSYA: {
      icon: Truck,
      label: 'PedidosYa',
      className: 'bg-pink-100 text-pink-900 dark:bg-pink-950/40 dark:text-pink-200',
    },
    RETIRO_LOCAL: {
      icon: Store,
      label: 'Retiro',
      className: 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
    },
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

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
