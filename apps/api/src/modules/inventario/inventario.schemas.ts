import { TipoMovimientoStock, UnidadMedida } from '@prisma/client';
import { z } from 'zod';

const guaraniEntero = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((v) => BigInt(v));

const decimalCantidad = z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,3})?$/)]);

// ───── Insumos ─────

export const crearInsumoInput = z.object({
  codigo: z.string().trim().max(50).optional(),
  codigoBarras: z.string().trim().max(50).optional(),
  nombre: z.string().trim().min(1).max(200),
  descripcion: z.string().trim().max(500).optional(),
  unidadMedida: z.nativeEnum(UnidadMedida),
  costoUnitario: guaraniEntero.default(0),
  categoria: z.string().trim().max(100).optional(),
  proveedorId: z.string().cuid().optional(),
});

export const actualizarInsumoInput = z.object({
  codigo: z.string().trim().max(50).nullable().optional(),
  codigoBarras: z.string().trim().max(50).nullable().optional(),
  nombre: z.string().trim().min(1).max(200).optional(),
  descripcion: z.string().trim().max(500).nullable().optional(),
  unidadMedida: z.nativeEnum(UnidadMedida).optional(),
  costoUnitario: guaraniEntero.optional(),
  categoria: z.string().trim().max(100).nullable().optional(),
  proveedorId: z.string().cuid().nullable().optional(),
  activo: z.boolean().optional(),
});

export const listarInsumosQuery = z.object({
  busqueda: z.string().trim().min(1).optional(),
  categoria: z.string().trim().min(1).optional(),
  proveedorId: z.string().cuid().optional(),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});

export const insumoIdParam = z.object({ id: z.string().cuid() });

// ───── Ajustes de stock ─────

const TIPOS_AJUSTE = [
  TipoMovimientoStock.ENTRADA_AJUSTE,
  TipoMovimientoStock.SALIDA_AJUSTE,
  TipoMovimientoStock.SALIDA_MERMA,
  TipoMovimientoStock.SALIDA_CONSUMO_INTERNO,
] as const;

export const ajustarStockInput = z.object({
  productoInventarioId: z.string().cuid(),
  sucursalId: z.string().cuid(),
  tipo: z.enum(TIPOS_AJUSTE.map((t) => t) as [string, ...string[]]),
  cantidad: decimalCantidad,
  motivo: z.string().trim().min(3).max(300),
});

// ───── Stock por sucursal (configuración) ─────

export const setStockMinimosInput = z.object({
  productoInventarioId: z.string().cuid(),
  sucursalId: z.string().cuid(),
  stockMinimo: decimalCantidad.optional(),
  stockMaximo: decimalCantidad.optional(),
});

export type CrearInsumoInput = z.infer<typeof crearInsumoInput>;
export type ActualizarInsumoInput = z.infer<typeof actualizarInsumoInput>;
export type AjustarStockInput = z.infer<typeof ajustarStockInput>;
export type SetStockMinimosInput = z.infer<typeof setStockMinimosInput>;
export type ListarInsumosQuery = z.infer<typeof listarInsumosQuery>;
