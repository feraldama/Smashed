'use client';

import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  ChefHat,
  Download,
  DollarSign,
  Loader2,
  Percent,
  Printer,
  Receipt,
  Sparkles,
  Tags,
  Timer,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { HeatmapHora } from '@/components/charts/HeatmapHora';
import { MetodosPagoChart } from '@/components/charts/MetodosPagoChart';
import { SalesLineChart } from '@/components/charts/SalesLineChart';
import { DateRangePicker, type DateRange } from '@/components/DateRangePicker';
import {
  buildCsvUrl,
  useCajaTurnos,
  useComparativaSucursales,
  useDescuentosListado,
  useDescuentosPorEmpleado,
  useMetodosPago,
  usePromocionesAhorro,
  useMovimientosResumen,
  useMovimientosStock,
  useProductosRentabilidad,
  useResumenVentas,
  useStockBajo,
  useTiemposCocina,
  useTopClientes,
  useTopProductos,
  useValuacion,
  useVentasPorCanal,
  useVentasPorDia,
  useVentasPorHora,
  type OrdenRentabilidad,
  type RangoFechas,
} from '@/hooks/useReportes';
import { useAuthStore } from '@/lib/auth-store';
import { cn, formatGs } from '@/lib/utils';

type Tab =
  | 'ventas'
  | 'cocina'
  | 'caja'
  | 'productos'
  | 'rentabilidad'
  | 'clientes'
  | 'sucursales'
  | 'inventario';

type SubTabVentas = 'resumen' | 'canales' | 'descuentos' | 'descuento-empleado' | 'promociones';
type SubTabInventario = 'stock' | 'movimientos';

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
        <TabButton active={tab === 'cocina'} onClick={() => setTab('cocina')} icon={ChefHat}>
          Cocina
        </TabButton>
        <TabButton active={tab === 'caja'} onClick={() => setTab('caja')} icon={Wallet}>
          Caja
        </TabButton>
        <TabButton active={tab === 'productos'} onClick={() => setTab('productos')} icon={Trophy}>
          Productos
        </TabButton>
        <TabButton
          active={tab === 'rentabilidad'}
          onClick={() => setTab('rentabilidad')}
          icon={DollarSign}
        >
          Rentabilidad
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
      {tab === 'cocina' && <TabCocina rango={rango} />}
      {tab === 'caja' && <TabCaja rango={rango} />}
      {tab === 'productos' && <TabProductos rango={rango} />}
      {tab === 'rentabilidad' && <TabRentabilidad rango={rango} />}
      {tab === 'clientes' && <TabClientes rango={rango} />}
      {tab === 'sucursales' && esAdminEmpresa && <TabSucursales rango={rango} />}
      {tab === 'inventario' && <TabInventario rango={rango} />}
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

// ───── TAB VENTAS — con sub-tabs (Resumen / Canales / Descuentos) ─────

function TabVentas({ rango }: { rango: DateRange }) {
  const [sub, setSub] = useState<SubTabVentas>('resumen');
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1">
        <SubTabBtn active={sub === 'resumen'} onClick={() => setSub('resumen')} icon={Receipt}>
          Resumen
        </SubTabBtn>
        <SubTabBtn active={sub === 'canales'} onClick={() => setSub('canales')} icon={Tags}>
          Por canal
        </SubTabBtn>
        <SubTabBtn
          active={sub === 'descuentos'}
          onClick={() => setSub('descuentos')}
          icon={Percent}
        >
          Descuentos
        </SubTabBtn>
        <SubTabBtn
          active={sub === 'descuento-empleado'}
          onClick={() => setSub('descuento-empleado')}
          icon={Users}
        >
          Por empleado
        </SubTabBtn>
        <SubTabBtn
          active={sub === 'promociones'}
          onClick={() => setSub('promociones')}
          icon={Sparkles}
        >
          Promociones
        </SubTabBtn>
      </nav>

      {sub === 'resumen' && <VentasResumen rango={rango} />}
      {sub === 'canales' && <VentasPorCanal rango={rango} />}
      {sub === 'descuentos' && <VentasDescuentos rango={rango} />}
      {sub === 'descuento-empleado' && <DescuentosPorEmpleado rango={rango} />}
      {sub === 'promociones' && <PromocionesAhorro rango={rango} />}
    </div>
  );
}

function VentasResumen({ rango }: { rango: DateRange }) {
  const { data: resumen, isLoading: loadingResumen } = useResumenVentas(rango);
  const { data: serie, isLoading: loadingSerie } = useVentasPorDia(rango);
  const { data: heatmap } = useVentasPorHora(rango);
  const { data: metodos } = useMetodosPago(rango);

  return (
    <div className="space-y-4">
      <ExportarBtns
        rango={rango}
        items={[
          { endpoint: '/reportes/ventas/resumen', label: 'Resumen' },
          { endpoint: '/reportes/ventas/por-dia', label: 'Por día' },
          { endpoint: '/reportes/ventas/por-hora', label: 'Por hora' },
          { endpoint: '/reportes/ventas/metodos-pago', label: 'Métodos de pago' },
        ]}
      />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <KpiCard
          label="Descuentos otorgados"
          value={resumen ? `-${formatGs(resumen.totalDescuentos)}` : '...'}
          loading={loadingResumen}
          icon={Percent}
        />
        <KpiCard
          label="Recargo delivery"
          value={resumen ? formatGs(resumen.totalRecargoDelivery) : '...'}
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

const CANAL_LABEL: Record<string, string> = {
  MOSTRADOR: 'Mostrador',
  MESA: 'Mesa',
  DELIVERY_PROPIO: 'Delivery propio',
  DELIVERY_PEDIDOSYA: 'PedidosYa',
  RETIRO_LOCAL: 'Retiro en local',
};

function VentasPorCanal({ rango }: { rango: DateRange }) {
  const { data: canales = [], isLoading } = useVentasPorCanal(rango);
  const totalGeneral = canales.reduce((acc, c) => acc + Number(c.total), 0);

  return (
    <div className="space-y-4">
      <ExportarBtns
        rango={rango}
        items={[{ endpoint: '/reportes/ventas/por-canal', label: 'Por canal' }]}
      />
      <Card title="Ventas por canal">
        {isLoading ? (
          <SkeletonChart />
        ) : canales.length === 0 ? (
          <Empty mensaje="No hay ventas en el período" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Canal</th>
                  <th className="px-2 py-2 text-right">Tickets</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-right">Ticket prom.</th>
                  <th className="px-2 py-2 text-right">Descuentos</th>
                  <th className="px-2 py-2 text-right">% del total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {canales.map((c) => {
                  const totalN = Number(c.total);
                  const pct = totalGeneral > 0 ? (totalN / totalGeneral) * 100 : 0;
                  return (
                    <tr key={c.tipo}>
                      <td className="px-2 py-2 font-medium">{CANAL_LABEL[c.tipo] ?? c.tipo}</td>
                      <td className="px-2 py-2 text-right font-mono">{c.cantidad}</td>
                      <td className="px-2 py-2 text-right font-mono">{formatGs(c.total)}</td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatGs(c.ticket_promedio)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-red-700 dark:text-red-300">
                        −{formatGs(c.total_descuentos)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function VentasDescuentos({ rango }: { rango: DateRange }) {
  const [tipo, setTipo] = useState<'TODOS' | 'PORCENTAJE' | 'MONTO' | 'CORTESIA'>('TODOS');
  const { data: descuentos = [], isLoading } = useDescuentosListado(rango, {
    tipo: tipo === 'TODOS' ? undefined : tipo,
    limite: 200,
  });
  const totalDescontado = descuentos.reduce((acc, d) => acc + Number(d.monto), 0);

  return (
    <div className="space-y-4">
      <ExportarBtns
        rango={rango}
        items={[{ endpoint: '/reportes/ventas/descuentos', label: 'Descuentos' }]}
        extra={tipo === 'TODOS' ? undefined : { tipo }}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Cantidad"
          value={String(descuentos.length)}
          loading={isLoading}
          icon={Percent}
        />
        <KpiCard
          label="Total descontado"
          value={`-${formatGs(totalDescontado)}`}
          loading={isLoading}
        />
        <KpiCard
          label="Promedio"
          value={
            descuentos.length > 0 ? formatGs(Math.round(totalDescontado / descuentos.length)) : '−'
          }
          loading={isLoading}
        />
      </section>

      <Card title="Listado detallado">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Tipo:</span>
          {(['TODOS', 'PORCENTAJE', 'MONTO', 'CORTESIA'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                tipo === t
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input hover:bg-accent',
              )}
            >
              {t === 'TODOS'
                ? 'Todos'
                : t === 'PORCENTAJE'
                  ? '%'
                  : t === 'MONTO'
                    ? 'Gs.'
                    : 'Cortesía'}
            </button>
          ))}
        </div>
        {isLoading ? (
          <SkeletonChart />
        ) : descuentos.length === 0 ? (
          <Empty mensaje="No se aplicaron descuentos en este período" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Fecha/Hora</th>
                  <th className="px-2 py-2">Pedido</th>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2 text-right">Monto</th>
                  <th className="px-2 py-2">Motivo</th>
                  <th className="px-2 py-2">Aplicó</th>
                  <th className="px-2 py-2">Autorizó</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {descuentos.map((d) => (
                  <tr key={d.pedido_id}>
                    <td className="px-2 py-2 font-mono text-[11px]">
                      {new Date(d.aplicado_en).toLocaleString('es-PY', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-2 py-2 font-mono">#{d.numero}</td>
                    <td className="px-2 py-2">{d.tipo}</td>
                    <td className="px-2 py-2 text-right font-mono text-red-700 dark:text-red-300">
                      −{formatGs(d.monto)}
                    </td>
                    <td className="px-2 py-2 truncate max-w-[180px]">{d.motivo ?? '—'}</td>
                    <td className="px-2 py-2 truncate max-w-[150px]">{d.aplicado_por ?? '—'}</td>
                    <td className="px-2 py-2 truncate max-w-[150px]">
                      {d.autorizado_por ?? <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function DescuentosPorEmpleado({ rango }: { rango: DateRange }) {
  const { data: filas = [], isLoading } = useDescuentosPorEmpleado(rango);

  const totales = filas.reduce(
    (acc, f) => ({
      ventas: acc.ventas + Number(f.cantidad_ventas),
      descontado: acc.descontado + Number(f.total_descontado),
      cobrado: acc.cobrado + Number(f.total_cobrado),
    }),
    { ventas: 0, descontado: 0, cobrado: 0 },
  );

  return (
    <div className="space-y-4">
      <ExportarBtns
        rango={rango}
        items={[{ endpoint: '/reportes/ventas/descuentos-por-empleado', label: 'Por empleado' }]}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Empleados beneficiados"
          value={String(filas.length)}
          loading={isLoading}
          icon={Users}
        />
        <KpiCard
          label="Total descontado"
          value={`-${formatGs(totales.descontado)}`}
          loading={isLoading}
        />
        <KpiCard label="Total cobrado neto" value={formatGs(totales.cobrado)} loading={isLoading} />
      </section>

      <Card title="Detalle por empleado">
        {isLoading ? (
          <SkeletonChart />
        ) : filas.length === 0 ? (
          <Empty mensaje="No hay descuentos empleado en este período" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Empleado</th>
                  <th className="px-2 py-2">Rol</th>
                  <th className="px-2 py-2 text-right">Ventas</th>
                  <th className="px-2 py-2 text-right">Base original</th>
                  <th className="px-2 py-2 text-right">Descontado</th>
                  <th className="px-2 py-2 text-right">Cobrado neto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filas.map((f) => (
                  <tr key={f.empleado_id}>
                    <td className="px-2 py-2 font-medium">{f.empleado_nombre}</td>
                    <td className="px-2 py-2 text-muted-foreground">{f.empleado_rol}</td>
                    <td className="px-2 py-2 text-right font-mono">{f.cantidad_ventas}</td>
                    <td className="px-2 py-2 text-right font-mono">{formatGs(f.base_original)}</td>
                    <td className="px-2 py-2 text-right font-mono text-red-700 dark:text-red-300">
                      −{formatGs(f.total_descontado)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-semibold">
                      {formatGs(f.total_cobrado)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filas.length > 0 && (
                <tfoot className="border-t-2 font-bold">
                  <tr>
                    <td className="px-2 py-2" colSpan={2}>
                      Total
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{totales.ventas}</td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2 text-right font-mono text-red-700 dark:text-red-300">
                      −{formatGs(totales.descontado)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{formatGs(totales.cobrado)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ───── Promociones — ahorro y unidades por promo ─────

function PromocionesAhorro({ rango }: { rango: DateRange }) {
  const { data: filas = [], isLoading } = usePromocionesAhorro(rango);

  const totales = filas.reduce(
    (acc, f) => ({
      pedidos: acc.pedidos + Number(f.pedidos),
      unidades: acc.unidades + Number(f.unidades),
      ahorro: acc.ahorro + Number(f.ahorro_total),
      cobrado: acc.cobrado + Number(f.cobrado_total),
    }),
    { pedidos: 0, unidades: 0, ahorro: 0, cobrado: 0 },
  );

  const tipoLabel: Record<string, string> = {
    PRECIO_FIJO: 'Precio fijo',
    PORCENTAJE: '% descuento',
    NXM: 'NxM',
    COMBO: 'Combo',
  };

  return (
    <div className="space-y-4">
      <ExportarBtns
        rango={rango}
        items={[{ endpoint: '/reportes/ventas/promociones', label: 'Promociones' }]}
      />

      <section className="grid gap-3 sm:grid-cols-4">
        <KpiCard
          label="Promos usadas"
          value={String(filas.length)}
          loading={isLoading}
          icon={Sparkles}
        />
        <KpiCard label="Unidades en promo" value={String(totales.unidades)} loading={isLoading} />
        <KpiCard
          label="Ahorro al cliente"
          value={`-${formatGs(totales.ahorro)}`}
          loading={isLoading}
        />
        <KpiCard label="Cobrado en promo" value={formatGs(totales.cobrado)} loading={isLoading} />
      </section>

      <Card title="Detalle por promoción">
        {isLoading ? (
          <SkeletonChart />
        ) : filas.length === 0 ? (
          <Empty mensaje="No se aplicaron promociones en este período" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Promoción</th>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2 text-right">Pedidos</th>
                  <th className="px-2 py-2 text-right">Unidades</th>
                  <th className="px-2 py-2 text-right">Cobrado</th>
                  <th className="px-2 py-2 text-right">Ahorro cliente</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filas.map((f) => (
                  <tr key={f.promocion_id}>
                    <td className="px-2 py-2 font-medium">
                      {f.nombre}
                      {!f.activo && (
                        <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] uppercase text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          inactiva
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {tipoLabel[f.tipo] ?? f.tipo}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{f.pedidos}</td>
                    <td className="px-2 py-2 text-right font-mono">{f.unidades}</td>
                    <td className="px-2 py-2 text-right font-mono">{formatGs(f.cobrado_total)}</td>
                    <td className="px-2 py-2 text-right font-mono text-emerald-700 dark:text-emerald-300">
                      −{formatGs(f.ahorro_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filas.length > 0 && (
                <tfoot className="border-t-2 font-bold">
                  <tr>
                    <td className="px-2 py-2" colSpan={2}>
                      Total
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{totales.pedidos}</td>
                    <td className="px-2 py-2 text-right font-mono">{totales.unidades}</td>
                    <td className="px-2 py-2 text-right font-mono">{formatGs(totales.cobrado)}</td>
                    <td className="px-2 py-2 text-right font-mono text-emerald-700 dark:text-emerald-300">
                      −{formatGs(totales.ahorro)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ───── TAB COCINA ─────

function TabCocina({ rango }: { rango: DateRange }) {
  const { data: filas = [], isLoading } = useTiemposCocina(rango);

  function formatSeg(s: number) {
    if (!Number.isFinite(s) || s <= 0) return '−';
    const min = Math.floor(s / 60);
    const seg = Math.round(s % 60);
    return `${min}:${String(seg).padStart(2, '0')}`;
  }

  return (
    <div className="space-y-4">
      <ExportarBtns
        rango={rango}
        items={[{ endpoint: '/reportes/cocina/tiempos', label: 'Tiempos de cocina' }]}
      />
      <Card title="Tiempos de cocina por sucursal">
        {isLoading ? (
          <SkeletonChart />
        ) : filas.length === 0 ? (
          <Empty mensaje="No hay pedidos con timeline completo (confirmado → listo → entregado) en el período" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Sucursal</th>
                  <th className="px-2 py-2 text-right">Pedidos</th>
                  <th className="px-2 py-2 text-right" colSpan={3}>
                    Tiempo de preparación
                  </th>
                  <th className="px-2 py-2 text-right" colSpan={3}>
                    Espera total del cliente
                  </th>
                </tr>
                <tr className="text-[10px] text-muted-foreground">
                  <th></th>
                  <th></th>
                  <th className="px-2 py-1 text-right">Promedio</th>
                  <th className="px-2 py-1 text-right">p50</th>
                  <th className="px-2 py-1 text-right">p90</th>
                  <th className="px-2 py-1 text-right">Promedio</th>
                  <th className="px-2 py-1 text-right">p50</th>
                  <th className="px-2 py-1 text-right">p90</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filas.map((f) => (
                  <tr key={f.sucursal_id}>
                    <td className="px-2 py-2 font-medium">{f.sucursal_nombre}</td>
                    <td className="px-2 py-2 text-right font-mono">{f.cantidad}</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatSeg(f.prep_promedio_seg)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-muted-foreground">
                      {formatSeg(f.prep_p50_seg)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-muted-foreground">
                      {formatSeg(f.prep_p90_seg)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {formatSeg(f.espera_promedio_seg)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-muted-foreground">
                      {formatSeg(f.espera_p50_seg)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-muted-foreground">
                      {formatSeg(f.espera_p90_seg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground">
          <Timer className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            <strong>Preparación</strong>: del confirmado al listo (cocina trabajando).{' '}
            <strong>Espera total</strong>: del confirmado al entregado (lo que ve el cliente).
            <strong> p50</strong> = mediana, <strong>p90</strong> = el 10% más lento.
          </span>
        </p>
      </Card>
    </div>
  );
}

// ───── TAB CAJA — turnos cerrados con apertura/cierre/gastos/diferencias ─────

function TabCaja({ rango }: { rango: DateRange }) {
  const { data: turnos = [], isLoading } = useCajaTurnos(rango);

  // KPIs agregados de todo el rango.
  const totales = turnos.reduce(
    (acc, t) => {
      acc.ventas += Number(t.total_ventas);
      acc.egresos += Number(t.egresos_efectivo);
      acc.ingresos += Number(t.ingresos_extra_efectivo);
      acc.diferencia += Number(t.diferencia_efectivo);
      return acc;
    },
    { ventas: 0, egresos: 0, ingresos: 0, diferencia: 0 },
  );

  return (
    <div className="space-y-4">
      <ExportarBtns
        rango={rango}
        items={[{ endpoint: '/reportes/caja/turnos', label: 'Caja — turnos' }]}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Turnos cerrados"
          value={String(turnos.length)}
          loading={isLoading}
          icon={Wallet}
        />
        <KpiCard
          label="Total ventas (todos los turnos)"
          value={formatGs(totales.ventas)}
          loading={isLoading}
          icon={Receipt}
        />
        <KpiCard
          label="Egresos / gastos"
          value={`-${formatGs(totales.egresos)}`}
          loading={isLoading}
        />
        <KpiCard
          label="Diferencia neta"
          value={`${totales.diferencia >= 0 ? '+' : ''}${formatGs(totales.diferencia)}`}
          loading={isLoading}
        />
      </section>

      <Card title="Turnos cerrados">
        {isLoading ? (
          <SkeletonChart />
        ) : turnos.length === 0 ? (
          <Empty mensaje="No hay turnos cerrados en este período" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Cerrado</th>
                  <th className="px-2 py-2">Sucursal</th>
                  <th className="px-2 py-2">Caja</th>
                  <th className="px-2 py-2">Cajero/a</th>
                  <th className="px-2 py-2 text-right">Inicial</th>
                  <th className="px-2 py-2 text-right">Ventas</th>
                  <th className="px-2 py-2 text-right">Ingresos</th>
                  <th className="px-2 py-2 text-right">Egresos</th>
                  <th className="px-2 py-2 text-right">Esperado</th>
                  <th className="px-2 py-2 text-right">Contado</th>
                  <th className="px-2 py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {turnos.map((t) => {
                  const dif = Number(t.diferencia_efectivo);
                  const cuadre = dif === 0 ? 'ok' : dif > 0 ? 'sobrante' : 'faltante';
                  return (
                    <tr key={t.cierre_id}>
                      <td className="px-2 py-2 font-mono text-[11px]">
                        {new Date(t.cerrada_en).toLocaleString('es-PY', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-2 py-2">{t.sucursal_nombre}</td>
                      <td className="px-2 py-2">{t.caja_nombre}</td>
                      <td className="px-2 py-2 truncate max-w-[160px]">{t.usuario_nombre}</td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatGs(t.monto_inicial)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">{formatGs(t.total_ventas)}</td>
                      <td className="px-2 py-2 text-right font-mono text-emerald-700 dark:text-emerald-300">
                        {Number(t.ingresos_extra_efectivo) > 0
                          ? `+${formatGs(t.ingresos_extra_efectivo)}`
                          : '−'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-red-700 dark:text-red-300">
                        {Number(t.egresos_efectivo) > 0 ? `−${formatGs(t.egresos_efectivo)}` : '−'}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatGs(t.total_esperado_efectivo)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatGs(t.total_contado_efectivo)}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-2 text-right font-mono font-semibold',
                          cuadre === 'ok' && 'text-emerald-700 dark:text-emerald-300',
                          cuadre === 'sobrante' && 'text-amber-700 dark:text-amber-300',
                          cuadre === 'faltante' && 'text-red-700 dark:text-red-300',
                        )}
                        title={
                          cuadre === 'ok'
                            ? 'Cuadra OK'
                            : cuadre === 'sobrante'
                              ? 'Sobrante'
                              : 'Faltante'
                        }
                      >
                        {dif >= 0 ? '+' : ''}
                        {formatGs(t.diferencia_efectivo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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

// ───── TAB RENTABILIDAD ─────

function TabRentabilidad({ rango }: { rango: DateRange }) {
  const [ordenarPor, setOrdenarPor] = useState<OrdenRentabilidad>('ganancia');
  const { data: filas = [], isLoading } = useProductosRentabilidad(rango, 30, ordenarPor);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2">
        <p className="text-xs text-muted-foreground">
          Ganancia = ingreso − costo. El costo es el snapshot guardado al emitir cada comprobante;
          los emitidos antes de esta funcionalidad cuentan con costo 0.
        </p>
        <div className="flex gap-1 rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setOrdenarPor('ganancia')}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              ordenarPor === 'ganancia'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            Ganancia
          </button>
          <button
            type="button"
            onClick={() => setOrdenarPor('margen')}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              ordenarPor === 'margen'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            Margen %
          </button>
        </div>
      </div>

      <Card
        title={`Rentabilidad por producto — orden: ${ordenarPor === 'ganancia' ? 'ganancia absoluta' : 'margen %'}`}
      >
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filas.length === 0 ? (
          <Empty mensaje="No hay ventas en el período" />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Producto</th>
                  <th className="px-3 py-2 text-right">Cant.</th>
                  <th className="px-3 py-2 text-right">Ingreso</th>
                  <th className="px-3 py-2 text-right">Costo</th>
                  <th className="px-3 py-2 text-right">Ganancia</th>
                  <th className="px-3 py-2 text-right">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filas.map((p, i) => {
                  const ingreso = Number(p.ingreso_total);
                  const costo = Number(p.costo_total);
                  const ganancia = Number(p.ganancia_total);
                  const margen = p.margen_porcentaje;
                  // Sin snapshot de costo (comprobantes viejos) la ganancia es == ingreso.
                  const sinCosto = costo === 0;
                  const margenColor =
                    margen === null
                      ? 'text-muted-foreground'
                      : margen >= 50
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : margen >= 20
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400';
                  return (
                    <tr key={p.producto_id ?? p.nombre} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">
                        {p.nombre}
                        {sinCosto && (
                          <span
                            className="ml-2 inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal uppercase text-muted-foreground"
                            title="Sin costo registrado en el snapshot — ganancia no confiable"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" />
                            sin costo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">{p.cantidad_total}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatGs(ingreso)}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                        {formatGs(costo)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {formatGs(ganancia)}
                      </td>
                      <td className={cn('px-3 py-2 text-right font-mono', margenColor)}>
                        {margen === null ? '—' : `${margen.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
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

function TabInventario({ rango }: { rango: DateRange }) {
  const [sub, setSub] = useState<SubTabInventario>('stock');

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1">
        <SubTabBtn active={sub === 'stock'} onClick={() => setSub('stock')} icon={Boxes}>
          Stock actual
        </SubTabBtn>
        <SubTabBtn
          active={sub === 'movimientos'}
          onClick={() => setSub('movimientos')}
          icon={TrendingUp}
        >
          Movimientos
        </SubTabBtn>
      </nav>
      {sub === 'stock' && <InventarioStock />}
      {sub === 'movimientos' && <InventarioMovimientos rango={rango} />}
    </div>
  );
}

function InventarioStock() {
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

// ───── INVENTARIO MOVIMIENTOS ─────

const TIPO_MOV_LABEL = {
  ENTRADA_COMPRA: 'Entrada por compra',
  ENTRADA_TRANSFERENCIA: 'Entrada por transferencia',
  ENTRADA_AJUSTE: 'Entrada por ajuste',
  ENTRADA_PRODUCCION: 'Entrada por producción',
  SALIDA_VENTA: 'Salida por venta',
  SALIDA_TRANSFERENCIA: 'Salida por transferencia',
  SALIDA_MERMA: 'Merma / Desperdicio',
  SALIDA_AJUSTE: 'Ajuste de inventario',
  SALIDA_CONSUMO_INTERNO: 'Consumo interno',
} as const;

type TipoFiltroMov = 'TODOS' | keyof typeof TIPO_MOV_LABEL;

function InventarioMovimientos({ rango }: { rango: DateRange }) {
  const [filtroTipo, setFiltroTipo] = useState<TipoFiltroMov>('TODOS');
  const { data: movimientos = [], isLoading: loadingMov } = useMovimientosStock(rango, {
    tipo: filtroTipo === 'TODOS' ? undefined : filtroTipo,
    limite: 500,
  });
  const { data: resumen = [], isLoading: loadingRes } = useMovimientosResumen(rango);

  // Agregaciones del resumen para mostrar como KPI cards arriba.
  const totalPorTipo = resumen.reduce<Record<string, { costo: number; cantidad: number }>>(
    (acc, r) => {
      const actual = acc[r.tipo] ?? { costo: 0, cantidad: 0 };
      actual.costo += Number(r.costo_estimado);
      actual.cantidad += Number(r.cantidad_movimientos);
      acc[r.tipo] = actual;
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-4">
      <ExportarBtns
        rango={rango}
        items={[
          { endpoint: '/reportes/inventario/movimientos', label: 'Movimientos detallados' },
          { endpoint: '/reportes/inventario/movimientos-resumen', label: 'Resumen por tipo' },
        ]}
        extra={filtroTipo === 'TODOS' ? undefined : { tipo: filtroTipo }}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Mermas / Desperdicios"
          value={`-${formatGs(totalPorTipo.SALIDA_MERMA?.costo ?? 0)}`}
          loading={loadingRes}
          icon={AlertTriangle}
        />
        <KpiCard
          label="Ajustes (salida)"
          value={`-${formatGs(totalPorTipo.SALIDA_AJUSTE?.costo ?? 0)}`}
          loading={loadingRes}
        />
        <KpiCard
          label="Consumo interno"
          value={`-${formatGs(totalPorTipo.SALIDA_CONSUMO_INTERNO?.costo ?? 0)}`}
          loading={loadingRes}
        />
        <KpiCard
          label="Entradas por compra"
          value={`+${formatGs(totalPorTipo.ENTRADA_COMPRA?.costo ?? 0)}`}
          loading={loadingRes}
        />
      </section>

      <Card title="Resumen agregado por tipo y sucursal">
        {loadingRes ? (
          <SkeletonChart />
        ) : resumen.length === 0 ? (
          <Empty mensaje="No hay movimientos en el período" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Sucursal</th>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2 text-right">Movimientos</th>
                  <th className="px-2 py-2 text-right">Cantidad total</th>
                  <th className="px-2 py-2 text-right">Costo estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {resumen.map((r) => (
                  <tr key={`${r.sucursal_id}-${r.tipo}`}>
                    <td className="px-2 py-2">{r.sucursal_nombre}</td>
                    <td className="px-2 py-2">{TIPO_MOV_LABEL[r.tipo] ?? r.tipo}</td>
                    <td className="px-2 py-2 text-right font-mono">{r.cantidad_movimientos}</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {Number(r.cantidad_total).toFixed(2)}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-2 text-right font-mono',
                        r.tipo.startsWith('SALIDA') && 'text-red-700 dark:text-red-300',
                        r.tipo.startsWith('ENTRADA') && 'text-emerald-700 dark:text-emerald-300',
                      )}
                    >
                      {formatGs(r.costo_estimado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Movimientos detallados">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Tipo:</span>
          {(['TODOS', ...Object.keys(TIPO_MOV_LABEL)] as Array<typeof filtroTipo>).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFiltroTipo(t)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
                filtroTipo === t
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-input hover:bg-accent',
              )}
            >
              {t === 'TODOS' ? 'Todos' : (TIPO_MOV_LABEL[t] ?? t)}
            </button>
          ))}
        </div>
        {loadingMov ? (
          <SkeletonChart />
        ) : movimientos.length === 0 ? (
          <Empty mensaje="No hay movimientos que coincidan" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Fecha/Hora</th>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2">Insumo</th>
                  <th className="px-2 py-2 text-right">Cantidad</th>
                  <th className="px-2 py-2">Sucursal</th>
                  <th className="px-2 py-2">Usuario</th>
                  <th className="px-2 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {movimientos.map((m) => {
                  const cant = Number(m.cantidad_signed);
                  return (
                    <tr key={m.id}>
                      <td className="px-2 py-2 font-mono text-[11px]">
                        {new Date(m.fecha).toLocaleString('es-PY', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-2 py-2">{TIPO_MOV_LABEL[m.tipo] ?? m.tipo}</td>
                      <td className="px-2 py-2">
                        <span className="block font-medium">{m.insumo_nombre}</span>
                        {m.insumo_codigo && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {m.insumo_codigo}
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-2 text-right font-mono',
                          cant > 0
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-red-700 dark:text-red-300',
                        )}
                      >
                        {cant > 0 ? '+' : ''}
                        {cant.toFixed(2)} {m.unidad_medida.toLowerCase()}
                      </td>
                      <td className="px-2 py-2">{m.sucursal_nombre}</td>
                      <td className="px-2 py-2 truncate max-w-[140px]">
                        {m.usuario_nombre ?? '—'}
                      </td>
                      <td className="px-2 py-2 truncate max-w-[200px]">{m.motivo ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

function SubTabBtn({
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
        'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

/**
 * Botones para exportar uno o varios reportes del bloque actual.
 *
 *  - "Imprimir / Guardar PDF": dispara `window.print()`. La página tiene CSS de
 *    impresión que limpia sidebar/headers (ver bloque <style jsx global> abajo).
 *    El usuario elige "Guardar como PDF" en el diálogo del browser si quiere PDF.
 *  - "Exportar CSV": un botón por cada reporte del bloque. Genera URL con
 *    `?formato=csv` + token de auth y dispara descarga nativa.
 */
function ExportarBtns({
  rango,
  items,
  extra,
}: {
  rango: RangoFechas;
  items: { endpoint: string; label: string }[];
  extra?: Record<string, string | number>;
}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  async function descargar(endpoint: string, label: string) {
    const url = buildCsvUrl(endpoint, rango, extra);
    // Usamos fetch + blob para poder pasar el JWT en headers (no se puede en
    // `<a download>` puro). El browser descarga el blob con el filename del
    // header Content-Disposition que mandó el server.
    const res = await fetch(url, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) {
      alert(`No se pudo exportar "${label}"`);
      return;
    }
    const blob = await res.blob();
    const disp = res.headers.get('Content-Disposition') ?? '';
    const match = /filename="?([^"]+)"?/.exec(disp);
    const filename = match?.[1] ?? `${label}.csv`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
        title="Abre el diálogo de impresión — desde ahí podés guardar como PDF"
      >
        <Printer className="h-3.5 w-3.5" /> Imprimir / Guardar PDF
      </button>
      {items.map((it) => (
        <button
          key={it.endpoint}
          type="button"
          onClick={() => {
            void descargar(it.endpoint, it.label);
          }}
          className="flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" />
          CSV — {it.label}
        </button>
      ))}
    </div>
  );
}
