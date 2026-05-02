'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  PackageCheck,
  Receipt,
  Store,
  Truck,
  Utensils,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AuthGate, ROLES_ENTREGAS } from '@/components/AuthGate';
import { Cronometro } from '@/components/kds/Cronometro';
import { CobrarModal } from '@/components/pos/CobrarModal';
import { toast } from '@/components/Toast';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { useMiAperturaActiva } from '@/hooks/useCaja';
import {
  type PedidoListItem,
  usePedidosPorEstado,
  useTransicionarPedido,
} from '@/hooks/usePedidos';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

const TIPO_ICON = {
  MOSTRADOR: Store,
  MESA: Utensils,
  DELIVERY: Truck,
} as const;

export default function EntregasPage() {
  return (
    <AuthGate roles={ROLES_ENTREGAS}>
      <EntregasScreen />
    </AuthGate>
  );
}

const ROLES_ADMIN_FE = new Set(['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN']);

function EntregasScreen() {
  const user = useAuthStore((s) => s.user);
  const esAdmin = user ? ROLES_ADMIN_FE.has(user.rol) : false;
  const { data: apertura } = useMiAperturaActiva();

  const { data: listos = [], isLoading: lLoading } = usePedidosPorEstado('LISTO');
  const { data: entregados = [], isLoading: eLoading } = usePedidosPorEstado('ENTREGADO');

  const transicion = useTransicionarPedido();
  const [cobrarPedido, setCobrarPedido] = useState<{ id: string; total: number } | null>(null);
  const router = useRouter();

  async function handleEntregar(p: PedidoListItem) {
    try {
      await transicion.mutateAsync({ id: p.id, estado: 'ENTREGADO' });
      toast.success(`Pedido #${p.numero} entregado`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al entregar');
    }
  }

  function handleCobrar(p: PedidoListItem) {
    if (!apertura) {
      toast.error('Necesitás caja abierta para cobrar. Ir a /caja.');
      return;
    }
    setCobrarPedido({ id: p.id, total: Number(p.total) });
  }

  function handleCobrarSuccess(comprobanteId: string) {
    setCobrarPedido(null);
    window.open(`/comprobantes/${comprobanteId}/imprimir`, '_blank');
    router.refresh();
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
        {esAdmin && (
          <>
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Admin
            </Link>
            <div className="h-6 w-px bg-border" />
          </>
        )}
        <h1 className="flex items-center gap-1.5 text-sm font-bold">
          <PackageCheck className="h-4 w-4" /> Entregas
        </h1>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{listos.length}</strong> listos
          </span>
          <span>
            <strong className="text-foreground">{entregados.length}</strong> por cobrar
          </span>
          <span className="hidden sm:inline">{user?.nombreCompleto}</span>
          <LogoutButton compact />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {lLoading || eLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Columna
              titulo="Listos para entregar"
              icon={<CheckCircle2 className="h-4 w-4" />}
              colorClass="text-emerald-700 dark:text-emerald-400"
              pedidos={listos}
              accion={(p) => (
                <button
                  type="button"
                  onClick={() => {
                    void handleEntregar(p);
                  }}
                  disabled={transicion.isPending}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                >
                  <PackageCheck className="h-4 w-4" /> Entregar
                </button>
              )}
            />
            <Columna
              titulo="Por cobrar"
              icon={<Receipt className="h-4 w-4" />}
              colorClass="text-primary"
              pedidos={entregados}
              accion={(p) => (
                <button
                  type="button"
                  onClick={() => handleCobrar(p)}
                  disabled={!apertura}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                >
                  <Wallet className="h-4 w-4" /> Cobrar
                </button>
              )}
            />
          </div>
        )}

        {!apertura && entregados.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="mr-1 inline h-4 w-4" />
            Para cobrar pedidos necesitás abrir tu caja primero.{' '}
            <Link href="/caja" className="font-semibold underline">
              Ir a Caja
            </Link>
            .
          </div>
        )}
      </main>

      {cobrarPedido && (
        <CobrarModal
          pedidoId={cobrarPedido.id}
          total={cobrarPedido.total}
          clienteInicial={null}
          onCancel={() => setCobrarPedido(null)}
          onSuccess={handleCobrarSuccess}
        />
      )}
    </div>
  );
}

function Columna({
  titulo,
  icon,
  colorClass,
  pedidos,
  accion,
}: {
  titulo: string;
  icon: React.ReactNode;
  colorClass: string;
  pedidos: PedidoListItem[];
  accion: (p: PedidoListItem) => React.ReactNode;
}) {
  return (
    <section>
      <h2
        className={cn(
          'mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide',
          colorClass,
        )}
      >
        {icon} {titulo}{' '}
        <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
          {pedidos.length}
        </span>
      </h2>
      {pedidos.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          Sin pedidos
        </div>
      ) : (
        <ul className="space-y-2">
          {pedidos.map((p) => (
            <PedidoEntregaCard key={p.id} pedido={p} accion={accion(p)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PedidoEntregaCard({
  pedido,
  accion,
}: {
  pedido: PedidoListItem;
  accion: React.ReactNode;
}) {
  const Icon = TIPO_ICON[pedido.tipo];

  return (
    <li className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-start gap-3 p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-bold tabular-nums">#{pedido.numero}</p>
            {pedido.mesa && (
              <p className="text-sm font-semibold text-muted-foreground">
                Mesa {pedido.mesa.numero}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {pedido.cliente?.razonSocial ?? 'Consumidor final'} · {pedido._count.items} ítem
            {pedido._count.items !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-base font-bold tabular-nums">
            Gs. {Number(pedido.total).toLocaleString('es-PY')}
          </span>
          <Cronometro desde={pedido.createdAt} tiempoEsperadoSegundos={null} />
        </div>
      </div>
      <div className="border-t bg-muted/20 p-2">{accion}</div>
    </li>
  );
}
