import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface RangoFechas {
  desde: Date;
  hasta: Date;
  sucursalId?: string;
  usuarioId?: string;
}

function buildQuery(r: RangoFechas, extra?: Record<string, string | number>) {
  const params = new URLSearchParams();
  params.set('desde', r.desde.toISOString());
  params.set('hasta', r.hasta.toISOString());
  if (r.sucursalId) params.set('sucursalId', r.sucursalId);
  if (r.usuarioId) params.set('usuarioId', r.usuarioId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  }
  return params.toString();
}

/**
 * Construye la URL completa con `?formato=csv` para descargar un reporte como
 * CSV. El cliente lo abre con `window.open` o un `<a download>` y dispara el
 * download nativo del browser.
 */
export function buildCsvUrl(
  endpoint: string,
  rango: RangoFechas,
  extra?: Record<string, string | number>,
): string {
  const qs = buildQuery(rango, { ...extra, formato: 'csv' });
  return `/api${endpoint}?${qs}`;
}

export interface ResumenVentas {
  total: string;
  cantidad: number;
  ticketPromedio: string;
  ivaTotal: string;
  totalDescuentos: string;
  totalRecargoDelivery: string;
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
  ticket_promedio: string;
  total_descuentos: string;
  total_recargo_delivery: string;
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
  ticket_promedio: string;
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

export interface ProductoRentabilidad {
  producto_id: string | null;
  nombre: string;
  cantidad_total: string;
  ingreso_total: string;
  costo_total: string;
  ganancia_total: string;
  margen_porcentaje: number | null;
}

export type OrdenRentabilidad = 'ganancia' | 'margen';

export function useProductosRentabilidad(
  rango: RangoFechas,
  limite = 20,
  ordenarPor: OrdenRentabilidad = 'ganancia',
) {
  return useQuery({
    queryKey: ['reportes', 'productos', 'rentabilidad', rango, limite, ordenarPor],
    queryFn: () =>
      api<{ productos: ProductoRentabilidad[] }>(
        `/reportes/productos/rentabilidad?${buildQuery(rango, { limite, ordenarPor })}`,
      ),
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

// ───── Ventas por canal (MOSTRADOR / MESA / DELIVERY_PROPIO / etc.) ─────

export interface CanalVenta {
  tipo: string;
  cantidad: string;
  total: string;
  ticket_promedio: string;
  total_descuentos: string;
}

export function useVentasPorCanal(rango: RangoFechas) {
  return useQuery({
    queryKey: ['reportes', 'por-canal', rango],
    queryFn: () =>
      api<{ canales: CanalVenta[] }>(`/reportes/ventas/por-canal?${buildQuery(rango)}`),
    select: (d) => d.canales,
  });
}

// ───── Descuentos aplicados — listado detallado ─────

export interface DescuentoAplicado {
  pedido_id: string;
  numero: number;
  tipo: 'PORCENTAJE' | 'MONTO' | 'CORTESIA';
  monto: string;
  observacion: string | null;
  aplicado_en: string;
  motivo: string | null;
  aplicado_por: string | null;
  autorizado_por: string | null;
  empleado_beneficiario: string | null;
  comprobante_id: string | null;
  comprobante_numero: string | null;
  tipo_pedido: string;
  sucursal_nombre: string;
}

export interface FiltrosDescuentos {
  motivoDescuentoId?: string;
  tipo?: 'PORCENTAJE' | 'MONTO' | 'CORTESIA';
  limite?: number;
}

export function useDescuentosListado(rango: RangoFechas, filtros: FiltrosDescuentos = {}) {
  return useQuery({
    queryKey: ['reportes', 'descuentos', rango, filtros],
    queryFn: () => {
      const extra: Record<string, string | number> = {};
      if (filtros.motivoDescuentoId) extra.motivoDescuentoId = filtros.motivoDescuentoId;
      if (filtros.tipo) extra.tipo = filtros.tipo;
      if (filtros.limite) extra.limite = filtros.limite;
      return api<{ descuentos: DescuentoAplicado[] }>(
        `/reportes/ventas/descuentos?${buildQuery(rango, extra)}`,
      );
    },
    select: (d) => d.descuentos,
  });
}

// ───── Descuentos por empleado (agregado) ─────

export interface DescuentoEmpleadoTicket {
  pedido_id: string;
  numero: number;
  fecha: string;
  monto: string;
  comprobante_id: string | null;
  comprobante_numero: string | null;
}

export interface DescuentoPorEmpleado {
  empleado_id: string;
  empleado_nombre: string;
  empleado_rol: string;
  cantidad_ventas: string;
  total_descontado: string;
  base_original: string;
  total_cobrado: string;
  tickets: DescuentoEmpleadoTicket[];
}

export function useDescuentosPorEmpleado(rango: RangoFechas) {
  return useQuery({
    queryKey: ['reportes', 'descuentos-por-empleado', rango],
    queryFn: () =>
      api<{ empleados: DescuentoPorEmpleado[] }>(
        `/reportes/ventas/descuentos-por-empleado?${buildQuery(rango)}`,
      ),
    select: (d) => d.empleados,
  });
}

// ───── Promociones — ahorro y unidades por promo ─────

export interface PromocionAhorroFila {
  promocion_id: string;
  nombre: string;
  tipo: 'PRECIO_FIJO' | 'PORCENTAJE' | 'NXM' | 'COMBO';
  activo: boolean;
  pedidos: string;
  unidades: string;
  ahorro_total: string;
  cobrado_total: string;
}

export function usePromocionesAhorro(rango: RangoFechas) {
  return useQuery({
    queryKey: ['reportes', 'promociones-ahorro', rango],
    queryFn: () =>
      api<{ promociones: PromocionAhorroFila[] }>(
        `/reportes/ventas/promociones?${buildQuery(rango)}`,
      ),
    select: (d) => d.promociones,
  });
}

// ───── Combos — qué se pide dentro de cada combo ─────

export interface ComboOpcionFila {
  combo_id: string;
  combo_nombre: string;
  grupo_id: string;
  grupo_nombre: string;
  grupo_orden: number;
  opcion_producto_id: string;
  opcion_nombre: string;
  veces: string;
}

export function useCombosOpciones(rango: RangoFechas) {
  return useQuery({
    queryKey: ['reportes', 'combos-opciones', rango],
    queryFn: () =>
      api<{ opciones: ComboOpcionFila[] }>(`/reportes/combos/opciones?${buildQuery(rango)}`),
    select: (d) => d.opciones,
  });
}

export interface ComboCombinacionFila {
  combo_id: string;
  combo_nombre: string;
  combinacion: string;
  veces: string;
}

export function useCombosCombinaciones(rango: RangoFechas) {
  return useQuery({
    queryKey: ['reportes', 'combos-combinaciones', rango],
    queryFn: () =>
      api<{ combinaciones: ComboCombinacionFila[] }>(
        `/reportes/combos/combinaciones?${buildQuery(rango)}`,
      ),
    select: (d) => d.combinaciones,
  });
}

// ───── Tiempos de cocina (promedios + percentiles) ─────

export interface TiemposCocinaPorSucursal {
  sucursal_id: string;
  sucursal_nombre: string;
  cantidad: string;
  prep_promedio_seg: number;
  prep_p50_seg: number;
  prep_p90_seg: number;
  espera_promedio_seg: number;
  espera_p50_seg: number;
  espera_p90_seg: number;
}

export function useTiemposCocina(rango: RangoFechas) {
  return useQuery({
    queryKey: ['reportes', 'cocina-tiempos', rango],
    queryFn: () =>
      api<{ sucursales: TiemposCocinaPorSucursal[] }>(
        `/reportes/cocina/tiempos?${buildQuery(rango)}`,
      ),
    select: (d) => d.sucursales,
  });
}

// ───── Caja diaria — listado de turnos cerrados ─────

export interface TurnoCaja {
  cierre_id: string;
  caja_nombre: string;
  sucursal_nombre: string;
  usuario_nombre: string;
  abierta_en: string;
  cerrada_en: string;
  monto_inicial: string;
  total_ventas: string;
  ingresos_extra_efectivo: string;
  egresos_efectivo: string;
  retiros_parciales: string;
  ventas_efectivo: string;
  total_esperado_efectivo: string;
  total_contado_efectivo: string;
  diferencia_efectivo: string;
}

export function useCajaTurnos(rango: RangoFechas) {
  return useQuery({
    queryKey: ['reportes', 'caja-turnos', rango],
    queryFn: () => api<{ turnos: TurnoCaja[] }>(`/reportes/caja/turnos?${buildQuery(rango)}`),
    select: (d) => d.turnos,
  });
}

// ───── Inventario — movimientos detallados + resumen por tipo ─────

export type TipoMovimientoStock =
  | 'ENTRADA_COMPRA'
  | 'ENTRADA_TRANSFERENCIA'
  | 'ENTRADA_AJUSTE'
  | 'ENTRADA_PRODUCCION'
  | 'SALIDA_VENTA'
  | 'SALIDA_TRANSFERENCIA'
  | 'SALIDA_MERMA'
  | 'SALIDA_AJUSTE'
  | 'SALIDA_CONSUMO_INTERNO';

export interface MovimientoStock {
  id: string;
  fecha: string;
  tipo: TipoMovimientoStock;
  insumo_codigo: string | null;
  insumo_nombre: string;
  sucursal_nombre: string;
  usuario_nombre: string | null;
  cantidad_signed: string;
  unidad_medida: string;
  costo_unitario: string;
  motivo: string | null;
}

export interface FiltrosMovimientos {
  tipo?: TipoMovimientoStock;
  insumoId?: string;
  limite?: number;
}

export function useMovimientosStock(rango: RangoFechas, filtros: FiltrosMovimientos = {}) {
  return useQuery({
    queryKey: ['reportes', 'movimientos-stock', rango, filtros],
    queryFn: () => {
      const extra: Record<string, string | number> = {};
      if (filtros.tipo) extra.tipo = filtros.tipo;
      if (filtros.insumoId) extra.insumoId = filtros.insumoId;
      if (filtros.limite) extra.limite = filtros.limite;
      return api<{ movimientos: MovimientoStock[] }>(
        `/reportes/inventario/movimientos?${buildQuery(rango, extra)}`,
      );
    },
    select: (d) => d.movimientos,
  });
}

export interface ResumenMovimiento {
  tipo: TipoMovimientoStock;
  sucursal_id: string;
  sucursal_nombre: string;
  cantidad_total: string;
  cantidad_movimientos: string;
  costo_estimado: string;
}

export function useMovimientosResumen(rango: RangoFechas) {
  return useQuery({
    queryKey: ['reportes', 'movimientos-resumen', rango],
    queryFn: () =>
      api<{ tipos: ResumenMovimiento[] }>(
        `/reportes/inventario/movimientos-resumen?${buildQuery(rango)}`,
      ),
    select: (d) => d.tipos,
  });
}
