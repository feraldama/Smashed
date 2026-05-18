import { z } from 'zod';

const dateString = z.coerce.date();

/**
 * Query base de todos los reportes con rango temporal.
 *
 *  - `desde` / `hasta`: ISO. Inclusive ambos.
 *  - `sucursalId`: filtra por sucursal específica (opcional). Si el usuario
 *    tiene `sucursalActivaId`, se aplica de oficio salvo que sea gestión.
 *  - `usuarioId`: filtra por cajero/usuario que tomó/aplicó/cobró
 *    (interpretación específica de cada endpoint).
 *  - `formato`: 'json' (default) o 'csv' — el controller intercepta y serializa.
 */
export const rangoFechasQuery = z.object({
  desde: dateString,
  hasta: dateString,
  sucursalId: z.string().cuid().optional(),
  usuarioId: z.string().cuid().optional(),
  formato: z.enum(['json', 'csv']).default('json'),
});

export const topQuery = rangoFechasQuery.extend({
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

// Rentabilidad por producto: además del rango+límite, permite ordenar por
// ganancia absoluta (default — qué genera más plata) o por margen porcentual
// (qué deja más margen relativo, útil para detectar productos premium).
export const rentabilidadQuery = topQuery.extend({
  ordenarPor: z.enum(['ganancia', 'margen']).default('ganancia'),
});

export const stockQuery = z.object({
  sucursalId: z.string().cuid().optional(),
  formato: z.enum(['json', 'csv']).default('json'),
});

// Listado detallado de descuentos aplicados (no es agregación — fila por pedido).
export const descuentosListadoQuery = rangoFechasQuery.extend({
  motivoDescuentoId: z.string().cuid().optional(),
  tipo: z.enum(['PORCENTAJE', 'MONTO', 'CORTESIA']).optional(),
  limite: z.coerce.number().int().min(1).max(500).default(200),
});

// Listado de movimientos de stock (entradas, salidas, ajustes, mermas).
// Acepta filtros por tipo, insumo, sucursal, usuario (quien movió), rango.
export const movimientosStockQuery = rangoFechasQuery.extend({
  tipo: z
    .enum([
      'ENTRADA_COMPRA',
      'ENTRADA_TRANSFERENCIA',
      'ENTRADA_AJUSTE',
      'ENTRADA_PRODUCCION',
      'SALIDA_VENTA',
      'SALIDA_TRANSFERENCIA',
      'SALIDA_MERMA',
      'SALIDA_AJUSTE',
      'SALIDA_CONSUMO_INTERNO',
    ])
    .optional(),
  insumoId: z.string().cuid().optional(),
  limite: z.coerce.number().int().min(1).max(1000).default(300),
});

export type RangoFechasQuery = z.infer<typeof rangoFechasQuery>;
export type TopQuery = z.infer<typeof topQuery>;
export type RentabilidadQuery = z.infer<typeof rentabilidadQuery>;
export type StockQuery = z.infer<typeof stockQuery>;
export type DescuentosListadoQuery = z.infer<typeof descuentosListadoQuery>;
export type MovimientosStockQuery = z.infer<typeof movimientosStockQuery>;
