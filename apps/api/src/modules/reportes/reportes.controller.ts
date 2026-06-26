import { Errors } from '../../lib/errors.js';

import {
  descuentosListadoQuery,
  movimientosStockQuery,
  rangoFechasQuery,
  rentabilidadQuery,
  stockQuery,
  topQuery,
} from './reportes.schemas.js';
import * as service from './reportes.service.js';

import type { Request, Response } from 'express';

function ctx(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  if (!req.context.empresaId) throw Errors.forbidden('Usuario sin empresa');
  return {
    empresaId: req.context.empresaId,
    sucursalActivaId: req.context.sucursalActivaId,
    rol: req.context.rol,
    isSuperAdmin: req.context.isSuperAdmin,
  };
}

// ───── Helpers para exportar CSV ─────

/**
 * Genera CSV a partir de filas + definición de columnas.
 * Cada columna tiene un `key` (acceso al campo de la fila) y `label` (header).
 *
 * Manejo de tipos:
 *  - `null` / `undefined` → vacío
 *  - `bigint` → string entero (preserva precisión vs `JSON.stringify`)
 *  - `Date` → ISO string
 *  - Resto → `String(...)`
 *
 * Escapado RFC4180: si el valor contiene coma, comillas o newline, se envuelve
 * en comillas dobles y se duplican las comillas internas.
 */
function csvFromRows<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T & string; label: string }[],
): string {
  const lines = [columns.map((c) => csvEscape(c.label)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(formatCsvCell(row[c.key]))).join(','));
  }
  return lines.join('\n');
}

function csvEscape(s: string): string {
  if (s === '') return '';
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatCsvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number') return String(v);
  return String(v);
}

/**
 * Manda el CSV con headers correctos. Incluye BOM UTF-8 para que Excel
 * lo abra con acentos OK al doble clic en Windows.
 */
function sendCsv(res: Response, filename: string, content: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + content);
}

function nombreArchivo(slug: string, desde?: unknown, hasta?: unknown): string {
  const d = desde instanceof Date ? desde.toISOString().slice(0, 10) : 'inicio';
  const h = hasta instanceof Date ? hasta.toISOString().slice(0, 10) : 'fin';
  return `${slug}_${d}_${h}.csv`;
}

// ───── Endpoints ─────

export async function resumenVentas(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.resumenVentas(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(
      [result],
      [
        { key: 'total', label: 'Total ventas' },
        { key: 'cantidad', label: 'Cantidad tickets' },
        { key: 'ticketPromedio', label: 'Ticket promedio' },
        { key: 'ivaTotal', label: 'IVA total' },
        { key: 'totalDescuentos', label: 'Total descuentos' },
        { key: 'totalRecargoDelivery', label: 'Total recargo delivery' },
      ],
    );
    sendCsv(res, nombreArchivo('resumen_ventas', q.desde, q.hasta), csv);
    return;
  }
  res.json(result);
}

export async function ventasPorDia(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.ventasPorDia(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result, [
      { key: 'fecha', label: 'Fecha' },
      { key: 'cantidad', label: 'Tickets' },
      { key: 'total', label: 'Total' },
      { key: 'ticket_promedio', label: 'Ticket promedio' },
      { key: 'total_descuentos', label: 'Descuentos' },
      { key: 'total_recargo_delivery', label: 'Recargo delivery' },
    ]);
    sendCsv(res, nombreArchivo('ventas_por_dia', q.desde, q.hasta), csv);
    return;
  }
  res.json({ series: result });
}

export async function ventasPorHora(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.ventasPorHora(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result, [
      { key: 'dia_semana', label: 'Día semana (0=Dom)' },
      { key: 'hora', label: 'Hora' },
      { key: 'cantidad', label: 'Tickets' },
      { key: 'total', label: 'Total' },
      { key: 'ticket_promedio', label: 'Ticket promedio' },
    ]);
    sendCsv(res, nombreArchivo('ventas_por_hora', q.desde, q.hasta), csv);
    return;
  }
  res.json({ celdas: result });
}

export async function ventasPorCanal(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.ventasPorCanal(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result, [
      { key: 'tipo', label: 'Canal' },
      { key: 'cantidad', label: 'Tickets' },
      { key: 'total', label: 'Total' },
      { key: 'ticket_promedio', label: 'Ticket promedio' },
      { key: 'total_descuentos', label: 'Descuentos' },
    ]);
    sendCsv(res, nombreArchivo('ventas_por_canal', q.desde, q.hasta), csv);
    return;
  }
  res.json({ canales: result });
}

export async function descuentosListado(req: Request, res: Response) {
  const c = ctx(req);
  const q = descuentosListadoQuery.parse(req.query);
  const result = await service.descuentosListado(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result, [
      { key: 'aplicado_en', label: 'Fecha/Hora' },
      { key: 'numero', label: 'Pedido #' },
      { key: 'comprobante_numero', label: 'Ticket' },
      { key: 'tipo_pedido', label: 'Canal' },
      { key: 'tipo', label: 'Tipo descuento' },
      { key: 'monto', label: 'Monto' },
      { key: 'motivo', label: 'Motivo' },
      { key: 'empleado_beneficiario', label: 'Beneficiario' },
      { key: 'aplicado_por', label: 'Aplicado por' },
      { key: 'autorizado_por', label: 'Autorizado por' },
      { key: 'observacion', label: 'Observación' },
      { key: 'sucursal_nombre', label: 'Sucursal' },
    ]);
    sendCsv(res, nombreArchivo('descuentos', q.desde, q.hasta), csv);
    return;
  }
  res.json({ descuentos: result });
}

export async function promocionesAhorro(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.promocionesAhorro(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result, [
      { key: 'nombre', label: 'Promoción' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'pedidos', label: 'Pedidos' },
      { key: 'unidades', label: 'Unidades' },
      { key: 'ahorro_total', label: 'Ahorro cliente (Gs.)' },
      { key: 'cobrado_total', label: 'Cobrado (Gs.)' },
    ]);
    sendCsv(res, nombreArchivo('promociones', q.desde, q.hasta), csv);
    return;
  }
  res.json({ promociones: result });
}

export async function combosOpciones(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.combosOpciones(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result as unknown as Record<string, unknown>[], [
      { key: 'combo_nombre', label: 'Combo' },
      { key: 'grupo_nombre', label: 'Grupo' },
      { key: 'opcion_nombre', label: 'Opción' },
      { key: 'veces', label: 'Veces pedida' },
    ]);
    sendCsv(res, nombreArchivo('combos_opciones', q.desde, q.hasta), csv);
    return;
  }
  res.json({ opciones: result });
}

export async function combosCombinaciones(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.combosCombinaciones(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result as unknown as Record<string, unknown>[], [
      { key: 'combo_nombre', label: 'Combo' },
      { key: 'combinacion', label: 'Combinación' },
      { key: 'veces', label: 'Veces pedida' },
    ]);
    sendCsv(res, nombreArchivo('combos_combinaciones', q.desde, q.hasta), csv);
    return;
  }
  res.json({ combinaciones: result });
}

export async function descuentosPorEmpleado(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.descuentosPorEmpleado(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result, [
      { key: 'empleado_nombre', label: 'Empleado' },
      { key: 'empleado_rol', label: 'Rol' },
      { key: 'cantidad_ventas', label: 'Cantidad de ventas' },
      { key: 'base_original', label: 'Base original (Gs.)' },
      { key: 'total_descontado', label: 'Total descontado (Gs.)' },
      { key: 'total_cobrado', label: 'Total cobrado (Gs.)' },
    ]);
    sendCsv(res, nombreArchivo('descuentos_por_empleado', q.desde, q.hasta), csv);
    return;
  }
  res.json({ empleados: result });
}

export async function tiemposCocina(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.tiemposCocina(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result, [
      { key: 'sucursal_nombre', label: 'Sucursal' },
      { key: 'cantidad', label: 'Pedidos' },
      { key: 'prep_promedio_seg', label: 'Prep promedio (seg)' },
      { key: 'prep_p50_seg', label: 'Prep p50 (seg)' },
      { key: 'prep_p90_seg', label: 'Prep p90 (seg)' },
      { key: 'espera_promedio_seg', label: 'Espera total promedio (seg)' },
      { key: 'espera_p50_seg', label: 'Espera p50 (seg)' },
      { key: 'espera_p90_seg', label: 'Espera p90 (seg)' },
    ]);
    sendCsv(res, nombreArchivo('tiempos_cocina', q.desde, q.hasta), csv);
    return;
  }
  res.json({ sucursales: result });
}

export async function cajaTurnos(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.cajaTurnos(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result, [
      { key: 'cerrada_en', label: 'Cerrada en' },
      { key: 'sucursal_nombre', label: 'Sucursal' },
      { key: 'caja_nombre', label: 'Caja' },
      { key: 'usuario_nombre', label: 'Cajero/a' },
      { key: 'abierta_en', label: 'Abierta en' },
      { key: 'monto_inicial', label: 'Monto inicial' },
      { key: 'total_ventas', label: 'Total ventas' },
      { key: 'ventas_efectivo', label: 'Ventas efectivo' },
      { key: 'ingresos_extra_efectivo', label: 'Ingresos extra' },
      { key: 'egresos_efectivo', label: 'Egresos / Gastos' },
      { key: 'retiros_parciales', label: 'Retiros parciales' },
      { key: 'total_esperado_efectivo', label: 'Esperado en caja' },
      { key: 'total_contado_efectivo', label: 'Contado por cajero' },
      { key: 'diferencia_efectivo', label: 'Diferencia' },
    ]);
    sendCsv(res, nombreArchivo('caja_turnos', q.desde, q.hasta), csv);
    return;
  }
  res.json({ turnos: result });
}

export async function topProductos(req: Request, res: Response) {
  const c = ctx(req);
  const q = topQuery.parse(req.query);
  const result = await service.topProductos(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result, [
      { key: 'nombre', label: 'Producto' },
      { key: 'cantidad_total', label: 'Cantidad vendida' },
      { key: 'ingreso_total', label: 'Ingresos' },
    ]);
    sendCsv(res, nombreArchivo('top_productos', q.desde, q.hasta), csv);
    return;
  }
  res.json({ productos: result });
}

export async function productosRentabilidad(req: Request, res: Response) {
  const c = ctx(req);
  const q = rentabilidadQuery.parse(req.query);
  const result = await service.productosRentabilidad(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result as unknown as Record<string, unknown>[], [
      { key: 'nombre', label: 'Producto' },
      { key: 'cantidad', label: 'Cantidad vendida' },
      { key: 'ingreso_total', label: 'Ingresos' },
      { key: 'costo_total', label: 'Costo' },
      { key: 'ganancia', label: 'Ganancia' },
      { key: 'margen', label: 'Margen %' },
    ]);
    sendCsv(res, nombreArchivo('rentabilidad', q.desde, q.hasta), csv);
    return;
  }
  res.json({ productos: result });
}

export async function topClientes(req: Request, res: Response) {
  const c = ctx(req);
  const q = topQuery.parse(req.query);
  const result = await service.topClientes(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result as unknown as Record<string, unknown>[], [
      { key: 'razon_social', label: 'Cliente' },
      { key: 'cantidad_compras', label: 'Compras' },
      { key: 'total_comprado', label: 'Total' },
    ]);
    sendCsv(res, nombreArchivo('top_clientes', q.desde, q.hasta), csv);
    return;
  }
  res.json({ clientes: result });
}

export async function metodosPago(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.metodosPago(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result, [
      { key: 'metodo', label: 'Método' },
      { key: 'cantidad', label: 'Operaciones' },
      { key: 'total', label: 'Total' },
    ]);
    sendCsv(res, nombreArchivo('metodos_pago', q.desde, q.hasta), csv);
    return;
  }
  res.json({ metodos: result });
}

export async function comparativaSucursales(req: Request, res: Response) {
  const c = ctx(req);
  if (c.rol !== 'ADMIN_EMPRESA' && !c.isSuperAdmin) {
    throw Errors.forbidden('Sólo admin puede ver comparativa de sucursales');
  }
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.comparativaSucursales(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result, [
      { key: 'nombre', label: 'Sucursal' },
      { key: 'establecimiento', label: 'Establecimiento' },
      { key: 'cantidad', label: 'Tickets' },
      { key: 'total', label: 'Total' },
      { key: 'ticket_promedio', label: 'Ticket promedio' },
    ]);
    sendCsv(res, nombreArchivo('comparativa_sucursales', q.desde, q.hasta), csv);
    return;
  }
  res.json({ sucursales: result });
}

export async function movimientosStock(req: Request, res: Response) {
  const c = ctx(req);
  const q = movimientosStockQuery.parse(req.query);
  const result = await service.movimientosStock(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result as unknown as Record<string, unknown>[], [
      { key: 'fecha', label: 'Fecha/Hora' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'insumo_codigo', label: 'Código' },
      { key: 'insumo_nombre', label: 'Insumo' },
      { key: 'cantidad_signed', label: 'Cantidad' },
      { key: 'unidad_medida', label: 'Unidad' },
      { key: 'costo_unitario', label: 'Costo unitario' },
      { key: 'sucursal_nombre', label: 'Sucursal' },
      { key: 'usuario_nombre', label: 'Usuario' },
      { key: 'motivo', label: 'Motivo' },
    ]);
    sendCsv(res, nombreArchivo('movimientos_stock', q.desde, q.hasta), csv);
    return;
  }
  res.json({ movimientos: result });
}

export async function movimientosResumen(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.movimientosResumen(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result as unknown as Record<string, unknown>[], [
      { key: 'sucursal_nombre', label: 'Sucursal' },
      { key: 'tipo', label: 'Tipo movimiento' },
      { key: 'cantidad_movimientos', label: 'Cant. movimientos' },
      { key: 'cantidad_total', label: 'Cantidad total' },
      { key: 'costo_estimado', label: 'Costo estimado (Gs.)' },
    ]);
    sendCsv(res, nombreArchivo('movimientos_resumen', q.desde, q.hasta), csv);
    return;
  }
  res.json({ tipos: result });
}

export async function stockBajo(req: Request, res: Response) {
  const c = ctx(req);
  const q = stockQuery.parse(req.query);
  const result = await service.stockBajo(c, q);
  if (q.formato === 'csv') {
    const csv = csvFromRows(result as unknown as Record<string, unknown>[], [
      { key: 'nombre', label: 'Insumo' },
      { key: 'codigo', label: 'Código' },
      { key: 'sucursal_nombre', label: 'Sucursal' },
      { key: 'stock_actual', label: 'Stock actual' },
      { key: 'stock_minimo', label: 'Stock mínimo' },
      { key: 'unidad_medida', label: 'Unidad' },
    ]);
    sendCsv(res, `stock_bajo_${new Date().toISOString().slice(0, 10)}.csv`, csv);
    return;
  }
  res.json({ alertas: result });
}

export async function valuacionInventario(req: Request, res: Response) {
  const c = ctx(req);
  const q = stockQuery.parse(req.query);
  const result = await service.valuacionInventario(c, q);
  res.json(result);
}

export async function dashboard(req: Request, res: Response) {
  const c = ctx(req);
  const sucursalId = typeof req.query.sucursalId === 'string' ? req.query.sucursalId : undefined;
  const result = await service.dashboardSnapshot(c, sucursalId);
  res.json(result);
}
