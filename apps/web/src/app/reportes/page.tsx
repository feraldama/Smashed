'use client';

import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  Loader2,
  Receipt,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { HeatmapHora } from '@/components/charts/HeatmapHora';
import { MetodosPagoChart } from '@/components/charts/MetodosPagoChart';
import { SalesLineChart } from '@/components/charts/SalesLineChart';
import { DateRangePicker, type DateRange } from '@/components/DateRangePicker';
import {
  useComparativaSucursales,
  useMetodosPago,
  useResumenVentas,
  useStockBajo,
  useTopClientes,
  useTopProductos,
  useValuacion,
  useVentasPorDia,
  useVentasPorHora,
} from '@/hooks/useReportes';
import { useAuthStore } from '@/lib/auth-store';
import { cn, formatGs } from '@/lib/utils';

type Tab = 'ventas' | 'productos' | 'clientes' | 'sucursales' | 'inventario';

export default function ReportesPage() {
  return (
    <AuthGate>
      <AdminShell>
        <ReportesScreen />
      </AdminShell>
    </AuthGate>
  );
}

function ReportesScreen() {
  const user = useAuthStore((s) => s.user);
  const esAdminEmpresa = user?.rol === 'ADMIN_EMPRESA' || user?.rol === 'SUPER_ADMIN';

  const ahora = new Date();
  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 29);
  hace30.setHours(0, 0, 0, 0);

  const [rango, setRango] = useState<DateRange>({ desde: hace30, hasta: ahora });
  const [tab, setTab] = useState<Tab>('ventas');

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Análisis de ventas, productos, clientes e inventario.
        </p>
      </header>

      {/* Date range picker — afecta a todos los tabs (excepto inventario que no usa rango) */}
      <div className="mb-4 rounded-lg border bg-card p-3">
        <DateRangePicker value={rango} onChange={setRango} />
      </div>

      {/* Tabs */}
      <nav className="mb-4 flex flex-wrap gap-1 border-b">
        <TabButton active={tab === 'ventas'} onClick={() => setTab('ventas')} icon={TrendingUp}>
          Ventas
        </TabButton>
        <TabButton active={tab === 'productos'} onClick={() => setTab('productos')} icon={Trophy}>
          Productos
        </TabButton>
        <TabButton active={tab === 'clientes'} onClick={() => setTab('clientes')} icon={Users}>
          Clientes
        </TabButton>
        {esAdminEmpresa && (
          <TabButton
            active={tab === 'sucursales'}
            onClick={() => setTab('sucursales')}
            icon={Building2}
          >
            Sucursales
          </TabButton>
        )}
        <TabButton active={tab === 'inventario'} onClick={() => setTab('inventario')} icon={Boxes}>
          Inventario
        </TabButton>
      </nav>

      {tab === 'ventas' && <TabVentas rango={rango} />}
      {tab === 'productos' && <TabProductos rango={rango} />}
      {tab === 'clientes' && <TabClientes rango={rango} />}
      {tab === 'sucursales' && esAdminEmpresa && <TabSucursales rango={rango} />}
      {tab === 'inventario' && <TabInventario />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

// ───── TAB VENTAS ─────

function TabVentas({ rango }: { rango: DateRange }) {
  const { data: resumen, isLoading: loadingResumen } = useResumenVentas(rango);
  const { data: serie, isLoading: loadingSerie } = useVentasPorDia(rango);
  const { data: heatmap } = useVentasPorHora(rango);
  const { data: metodos } = useMetodosPago(rango);

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Ventas totales"
          value={resumen ? formatGs(resumen.total) : '...'}
          loading={loadingResumen}
          icon={Receipt}
        />
        <KpiCard
          label="Comprobantes"
          value={resumen ? String(resumen.cantidad) : '...'}
          loading={loadingResumen}
        />
        <KpiCard
          label="Ticket promedio"
          value={resumen ? formatGs(resumen.ticketPromedio) : '...'}
          loading={loadingResumen}
        />
        <KpiCard
          label="IVA recaudado"
          value={resumen ? formatGs(resumen.ivaTotal) : '...'}
          loading={loadingResumen}
        />
      </section>

      <Card title="Ventas por día">
        {loadingSerie ? <SkeletonChart /> : <SalesLineChart series={serie ?? []} />}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Heatmap horario (día × hora)">
          <HeatmapHora celdas={heatmap ?? []} />
        </Card>
        <Card title="Métodos de pago">
          <MetodosPagoChart metodos={metodos ?? []} />
        </Card>
      </div>
    </div>
  );
}

// ───── TAB PRODUCTOS ─────

function TabProductos({ rango }: { rango: DateRange }) {
  const { data: top = [], isLoading } = useTopProductos(rango, 30);
  const max = top.reduce((acc, p) => Math.max(acc, Number(p.ingreso_total)), 0);

  return (
    <Card title={`Top ${top.length} productos por ingreso`}>
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : top.length === 0 ? (
        <Empty mensaje="No hay ventas en el período" />
      ) : (
        <div className="space-y-1.5">
          {top.map((p, i) => {
            const ingreso = Number(p.ingreso_total);
            const cant = Number(p.cantidad_total);
            const pct = max > 0 ? (ingreso / max) * 100 : 0;
            return (
              <div
                key={p.producto_id ?? p.nombre}
                className="grid grid-cols-[24px,1fr,80px,100px] items-center gap-2 rounded-md p-1.5 hover:bg-muted/30"
              >
                <span className="text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.nombre}</p>
                  <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className="text-right text-xs text-muted-foreground">{cant} u.</span>
                <span className="text-right font-mono text-sm font-semibold">
                  {formatGs(ingreso)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ───── TAB CLIENTES ─────

function TabClientes({ rango }: { rango: DateRange }) {
  const { data: top = [], isLoading } = useTopClientes(rango);

  return (
    <Card title={`Top ${top.length} clientes por consumo`}>
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : top.length === 0 ? (
        <Empty mensaje="Sin compras de clientes registrados (todas las ventas fueron a consumidor final)" />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">RUC</th>
                <th className="px-3 py-2 text-right">Compras</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {top.map((c) => (
                <tr key={c.cliente_id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{c.razon_social}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {c.ruc ? `${c.ruc}-${c.dv}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">{c.cantidad_compras}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {formatGs(c.total_gastado)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ───── TAB SUCURSALES ─────

function TabSucursales({ rango }: { rango: DateRange }) {
  const { data: sucursales = [], isLoading } = useComparativaSucursales(rango);
  const max = sucursales.reduce((acc, s) => Math.max(acc, Number(s.total)), 0);

  return (
    <Card title="Comparativa de sucursales">
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {sucursales.map((s) => {
            const total = Number(s.total);
            const pct = max > 0 ? (total / max) * 100 : 0;
            return (
              <div key={s.sucursal_id} className="rounded-md border bg-card p-3">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-sm font-semibold">{s.nombre}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Establecimiento {s.establecimiento} · {s.cantidad} comprobante
                      {s.cantidad !== '1' ? 's' : ''}
                    </p>
                  </div>
                  <p className="font-mono text-lg font-bold text-primary">{formatGs(total)}</p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-right text-[11px] text-muted-foreground">
                  Ticket promedio: {formatGs(s.ticket_promedio)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ───── TAB INVENTARIO ─────

function TabInventario() {
  const { data: stockBajo = [], isLoading: loadingStock } = useStockBajo();
  const { data: valuacion, isLoading: loadingVal } = useValuacion();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Stock bajo">
        {loadingStock ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : stockBajo.length === 0 ? (
          <p className="rounded-md bg-emerald-500/10 p-3 text-center text-sm text-emerald-700">
            ✓ Todos los insumos tienen stock saludable
          </p>
        ) : (
          <ul className="space-y-1.5">
            {stockBajo.map((a) => (
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
                  <span className="text-amber-700">{Number(a.stock_actual).toFixed(2)}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    / {Number(a.stock_minimo).toFixed(0)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Valuación de inventario">
        {loadingVal ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !valuacion ? (
          <Empty mensaje="Sin datos" />
        ) : (
          <>
            <div className="mb-3 rounded-md bg-primary/5 p-3 text-center">
              <p className="text-xs text-muted-foreground">Valor total</p>
              <p className="font-mono text-2xl font-bold text-primary">
                {formatGs(valuacion.totalGeneral)}
              </p>
            </div>
            <ul className="space-y-1 text-xs">
              {valuacion.items.slice(0, 12).map((it) => (
                <li
                  key={it.insumo_id}
                  className="flex items-baseline justify-between gap-2 border-b py-1 last:border-b-0"
                >
                  <span className="truncate">{it.nombre}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {Number(it.stock_total).toFixed(0)} {it.unidad_medida.toLowerCase()}
                  </span>
                  <span className="font-mono font-semibold">{formatGs(it.valor_total)}</span>
                </li>
              ))}
              {valuacion.items.length > 12 && (
                <li className="pt-1 text-center text-[10px] text-muted-foreground">
                  + {valuacion.items.length - 12} más
                </li>
              )}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

// ───── helpers ─────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" />
        {title}
      </h2>
      {children}
    </div>
  );
}

function KpiCard({
  label,
  value,
  loading,
  icon: Icon,
}: {
  label: string;
  value: string;
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        <p className="text-[11px] uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1 truncate font-mono text-2xl font-bold">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : value}
      </p>
    </div>
  );
}

function SkeletonChart() {
  return <div className="h-[280px] animate-pulse rounded-md bg-muted/50" />;
}

function Empty({ mensaje }: { mensaje: string }) {
  return (
    <p className="rounded-md bg-muted/30 p-6 text-center text-sm text-muted-foreground">
      {mensaje}
    </p>
  );
}
