import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface RangoFechas {
  desde: Date;
  hasta: Date;
  sucursalId?: string;
}

function buildQuery(r: RangoFechas, extra?: Record<string, string | number>) {
  const params = new URLSearchParams();
  params.set('desde', r.desde.toISOString());
  params.set('hasta', r.hasta.toISOString());
  if (r.sucursalId) params.set('sucursalId', r.sucursalId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  }
  return params.toString();
}

export interface ResumenVentas {
  total: string;
  cantidad: number;
  ticketPromedio: string;
  ivaTotal: string;
}

export function useResumenVentas(rango: RangoFechas) {
  return useQuery({
    queryKey: ['reportes', 'ventas', 'resumen', rango],
    queryFn: () => api<ResumenVentas>(`/reportes/ventas/resumen?${buildQuery(rango)}`),
  });
}

export interface PuntoSerie {
  fecha: string;
  total: string;
  cantidad: string;
}

export function useVentasPorDia(rango: RangoFechas) {
  return useQuery({
    queryKey: ['reportes', 'ventas', 'por-dia', rango],
    queryFn: () => api<{ series: PuntoSerie[] }>(`/reportes/ventas/por-dia?${buildQuery(rango)}`),
    select: (d) => d.series,
  });
}

export interface CeldaHora {
  dia_semana: number;
  hora: number;
  cantidad: string;
  total: string;
}

export function useVentasPorHora(rango: RangoFechas) {
  return useQuery({
    queryKey: ['reportes', 'ventas', 'por-hora', rango],
    queryFn: () => api<{ celdas: CeldaHora[] }>(`/reportes/ventas/por-hora?${buildQuery(rango)}`),
    select: (d) => d.celdas,
  });
}

export interface TopProducto {
  producto_id: string | null;
  nombre: string;
  cantidad_total: string;
  ingreso_total: string;
}

export function useTopProductos(rango: RangoFechas, limite = 20) {
  return useQuery({
    queryKey: ['reportes', 'productos', 'top', rango, limite],
    queryFn: () =>
      api<{ productos: TopProducto[] }>(`/reportes/productos/top?${buildQuery(rango, { limite })}`),
    select: (d) => d.productos,
  });
}

export interface TopCliente {
  cliente_id: string;
  razon_social: string;
  ruc: string | null;
  dv: string | null;
  cantidad_compras: string;
  total_gastado: string;
}

export function useTopClientes(rango: RangoFechas, limite = 20) {
  return useQuery({
    queryKey: ['reportes', 'clientes', 'top', rango, limite],
    queryFn: () =>
      api<{ clientes: TopCliente[] }>(`/reportes/clientes/top?${buildQuery(rango, { limite })}`),
    select: (d) => d.clientes,
  });
}

export interface MetodoPagoTotal {
  metodo: string;
  cantidad: string;
  total: string;
}

export function useMetodosPago(rango: RangoFechas) {
  return useQuery({
    queryKey: ['reportes', 'metodos-pago', rango],
    queryFn: () =>
      api<{ metodos: MetodoPagoTotal[] }>(`/reportes/ventas/metodos-pago?${buildQuery(rango)}`),
    select: (d) => d.metodos,
  });
}

export interface SucursalComp {
  sucursal_id: string;
  nombre: string;
  establecimiento: string;
  cantidad: string;
  total: string;
  ticket_promedio: string;
}

export function useComparativaSucursales(rango: RangoFechas) {
  return useQuery({
    queryKey: ['reportes', 'sucursales', rango],
    queryFn: () =>
      api<{ sucursales: SucursalComp[] }>(`/reportes/sucursales/comparativa?${buildQuery(rango)}`),
    select: (d) => d.sucursales,
  });
}

export interface AlertaStock {
  insumo_id: string;
  codigo: string | null;
  nombre: string;
  unidad_medida: string;
  stock_actual: string;
  stock_minimo: string;
  sucursal_id: string;
  sucursal_nombre: string;
}

export function useStockBajo(sucursalId?: string) {
  const qs = sucursalId ? `?sucursalId=${sucursalId}` : '';
  return useQuery({
    queryKey: ['reportes', 'stock-bajo', sucursalId],
    queryFn: () => api<{ alertas: AlertaStock[] }>(`/reportes/inventario/stock-bajo${qs}`),
    select: (d) => d.alertas,
  });
}

export interface ItemValuacion {
  insumo_id: string;
  codigo: string | null;
  nombre: string;
  unidad_medida: string;
  stock_total: string;
  costo_unitario: string;
  valor_total: string;
}

export function useValuacion(sucursalId?: string) {
  const qs = sucursalId ? `?sucursalId=${sucursalId}` : '';
  return useQuery({
    queryKey: ['reportes', 'valuacion', sucursalId],
    queryFn: () =>
      api<{ items: ItemValuacion[]; totalGeneral: string }>(`/reportes/inventario/valuacion${qs}`),
  });
}

export interface DashboardData {
  hoy: ResumenVentas;
  ayer: ResumenVentas;
  semana: ResumenVentas;
  ventasUltimos30: PuntoSerie[];
  topProductosSemana: TopProducto[];
  alertasStock: AlertaStock[];
  alertasStockTotal: number;
}

export function useDashboard(sucursalId?: string) {
  const qs = sucursalId ? `?sucursalId=${sucursalId}` : '';
  return useQuery({
    queryKey: ['reportes', 'dashboard', sucursalId],
    queryFn: () => api<DashboardData>(`/reportes/dashboard${qs}`),
  });
}
