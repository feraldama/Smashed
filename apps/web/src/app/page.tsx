'use client';

import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Boxes,
  Loader2,
  Receipt,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import Link from 'next/link';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { SalesLineChart } from '@/components/charts/SalesLineChart';
import { useDashboard } from '@/hooks/useReportes';
import { useAuthStore } from '@/lib/auth-store';
import { cn, formatGs } from '@/lib/utils';

export default function HomePage() {
  return (
    <AuthGate>
      <AdminShell>
        <Dashboard />
      </AdminShell>
    </AuthGate>
  );
}

function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError } = useDashboard();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error cargando el dashboard
      </div>
    );
  }

  const hoy = Number(data.hoy.total);
  const ayer = Number(data.ayer.total);
  const variacion = ayer > 0 ? ((hoy - ayer) / ayer) * 100 : null;

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Hola, {user?.nombreCompleto?.split(' ')[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('es-PY', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BigKpi
          label="Ventas hoy"
          value={formatGs(hoy)}
          subtitle={`${data.hoy.cantidad} comprobante${data.hoy.cantidad !== 1 ? 's' : ''}`}
          variacion={variacion}
          highlight
        />
        <BigKpi
          label="Ayer"
          value={formatGs(ayer)}
          subtitle={`${data.ayer.cantidad} comprobante${data.ayer.cantidad !== 1 ? 's' : ''}`}
        />
        <BigKpi
          label="Última semana"
          value={formatGs(data.semana.total)}
          subtitle={`Ticket prom. ${formatGs(data.semana.ticketPromedio)}`}
        />
        <BigKpi
          label="Alertas de stock"
          value={String(data.alertasStockTotal)}
          subtitle={data.alertasStockTotal === 0 ? 'Todo bien' : 'Insumos bajos'}
          intent={data.alertasStockTotal > 0 ? 'warning' : 'ok'}
          href="/reportes"
        />
      </section>

      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Ventas últimos 30 días
            </h2>
            <Link
              href="/reportes"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Ver todos los reportes <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <SalesLineChart series={data.ventasUltimos30} height={240} />
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Trophy className="h-3.5 w-3.5" />
            Top productos (semana)
          </h2>
          {data.topProductosSemana.length === 0 ? (
            <p className="rounded-md bg-muted/30 p-6 text-center text-xs text-muted-foreground">
              Sin ventas esta semana
            </p>
          ) : (
            <ol className="space-y-2 text-sm">
              {data.topProductosSemana.map((p, i) => (
                <li
                  key={p.producto_id ?? p.nombre}
                  className="flex items-center gap-2 rounded-md p-1.5 hover:bg-muted/30"
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                      i === 0 && 'bg-yellow-500/20 text-yellow-700',
                      i === 1 && 'bg-gray-400/20 text-gray-700',
                      i === 2 && 'bg-amber-700/20 text-amber-800',
                      i > 2 && 'bg-muted text-muted-foreground',
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{p.nombre}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {Number(p.cantidad_total)} unidades
                    </p>
                  </div>
                  <span className="font-mono text-xs font-semibold">
                    {formatGs(p.ingreso_total)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              Stock bajo
            </h2>
            <Link
              href="/insumos"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Gestionar inventario <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {data.alertasStock.length === 0 ? (
            <p className="rounded-md bg-emerald-500/10 p-3 text-center text-sm text-emerald-700">
              ✓ Todos los insumos tienen stock saludable
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.alertasStock.slice(0, 8).map((a) => (
                <li
                  key={`${a.insumo_id}-${a.sucursal_id}`}
                  className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-sm"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.nombre}</p>
                    <p className="text-[10px] text-muted-foreground">{a.sucursal_nombre}</p>
                  </div>
                  <span className="font-mono text-xs">
                    <span className="font-bold text-amber-700">
                      {Number(a.stock_actual).toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">
                      {' / '}
                      {Number(a.stock_minimo).toFixed(0)} {a.unidad_medida.toLowerCase()}
                    </span>
                  </span>
                </li>
              ))}
              {data.alertasStockTotal > 8 && (
                <li className="text-center text-[11px] text-muted-foreground">
                  + {data.alertasStockTotal - 8} más
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Accesos rápidos
          </h2>
          <div className="grid gap-2">
            <QuickLink href="/productos/nuevo" icon={Receipt} label="Nuevo producto" />
            <QuickLink href="/insumos" icon={Boxes} label="Inventario" />
            <QuickLink href="/reportes" icon={BarChart3} label="Reportes completos" />
          </div>
        </div>
      </section>
    </div>
  );
}

function BigKpi({
  label,
  value,
  subtitle,
  variacion,
  highlight,
  intent,
  href,
}: {
  label: string;
  value: string;
  subtitle?: string;
  variacion?: number | null;
  highlight?: boolean;
  intent?: 'ok' | 'warning';
  href?: string;
}) {
  const inner = (
    <div
      className={cn(
        'rounded-lg border bg-card p-4',
        highlight && 'border-primary/40 bg-primary/5',
        intent === 'warning' && 'border-amber-500/40 bg-amber-500/5',
        intent === 'ok' && 'border-emerald-500/30',
        href && 'transition-shadow hover:shadow-md',
      )}
    >
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 truncate font-mono text-2xl font-bold',
          highlight && 'text-primary',
          intent === 'warning' && 'text-amber-700',
        )}
      >
        {value}
      </p>
      {variacion !== null && variacion !== undefined && (
        <p
          className={cn(
            'mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium',
            variacion > 0 && 'text-emerald-600',
            variacion < 0 && 'text-destructive',
            variacion === 0 && 'text-muted-foreground',
          )}
        >
          {variacion > 0 ? (
            <ArrowUp className="h-3 w-3" />
          ) : variacion < 0 ? (
            <ArrowDown className="h-3 w-3" />
          ) : null}
          {variacion > 0 ? '+' : ''}
          {variacion.toFixed(1)}% vs ayer
        </p>
      )}
      {subtitle && variacion === undefined && (
        <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
    >
      <Icon className="h-4 w-4 text-primary" />
      {label}
      <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  );
}
