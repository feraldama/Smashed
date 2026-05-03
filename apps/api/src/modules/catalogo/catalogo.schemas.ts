import {
  CategoriaProducto,
  SectorComanda,
  TasaIva,
  TipoModificadorGrupo,
  UnidadMedida,
} from '@prisma/client';
import { z } from 'zod';

const guaraniEntero = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((v) => BigInt(v));

// ───── Listar / detalle ─────

export const listarProductosQuery = z.object({
  categoriaId: z.string().cuid().optional(),
  busqueda: z.string().trim().min(1).optional(),
  esCombo: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  incluirNoVendibles: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  // Paginación opcional: si llega `pageSize`, se pagina con skip/take. Si no
  // se envía, devuelve todos (uso típico del POS, que necesita el catálogo
  // completo para mostrar como tarjetas).
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const obtenerProductoParams = z.object({
  id: z.string().cuid(),
});

// ───── Categorías ─────

export const crearCategoriaInput = z.object({
  nombre: z.string().trim().min(1).max(100),
  codigo: z.string().trim().max(20).optional(),
  categoriaBase: z.nativeEnum(CategoriaProducto).default(CategoriaProducto.OTRO),
  ordenMenu: z.number().int().nonnegative().default(0),
  iconoUrl: z.string().url().optional(),
});

export const actualizarCategoriaInput = crearCategoriaInput.partial().extend({
  activa: z.boolean().optional(),
});

export const categoriaIdParam = z.object({ id: z.string().cuid() });

// ───── Productos de venta ─────

export const crearProductoInput = z.object({
  categoriaId: z.string().cuid().optional(),
  codigo: z.string().trim().max(50).optional(),
  codigoBarras: z.string().trim().max(50).optional(),
  nombre: z.string().trim().min(1).max(200),
  descripcion: z.string().trim().max(500).optional(),
  precioBase: guaraniEntero,
  tasaIva: z.nativeEnum(TasaIva).default(TasaIva.IVA_10),
  imagenUrl: z.string().url().max(500).optional(),
  sectorComanda: z.nativeEnum(SectorComanda).optional(),
  tiempoPrepSegundos: z.number().int().min(0).max(7200).optional(),
  esCombo: z.boolean().default(false),
  esVendible: z.boolean().default(true),
  esPreparacion: z.boolean().default(false),
});

export const actualizarProductoInput = crearProductoInput.partial().extend({
  activo: z.boolean().optional(),
});

export const productoIdParam = z.object({ id: z.string().cuid() });

// ───── Precio por sucursal ─────

export const setPrecioSucursalInput = z.object({
  sucursalId: z.string().cuid(),
  precio: guaraniEntero,
  vigenteDesde: z.coerce.date().optional(),
  vigenteHasta: z.coerce.date().optional(),
});

// ───── Receta ─────

const decimalCantidad = z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,3})?$/)]);

export const itemRecetaInput = z
  .object({
    productoInventarioId: z.string().cuid().optional(),
    subProductoVentaId: z.string().cuid().optional(),
    cantidad: decimalCantidad,
    unidadMedida: z.nativeEnum(UnidadMedida),
    esOpcional: z.boolean().default(false),
    notas: z.string().trim().max(200).optional(),
  })
  .refine(
    (data) =>
      (data.productoInventarioId && !data.subProductoVentaId) ||
      (!data.productoInventarioId && data.subProductoVentaId),
    {
      message: 'Cada item debe ser exactamente uno de: insumo o sub-producto',
      path: ['productoInventarioId'],
    },
  );

export const setRecetaInput = z.object({
  rinde: decimalCantidad.default(1),
  notas: z.string().trim().max(500).optional(),
  items: z.array(itemRecetaInput).min(1).max(50),
});

// ───── Combo ─────

export const comboGrupoOpcionInput = z.object({
  productoVentaId: z.string().cuid(),
  precioExtra: guaraniEntero.default(0),
  esDefault: z.boolean().default(false),
  orden: z.number().int().nonnegative().default(0),
});

export const comboGrupoInput = z.object({
  nombre: z.string().trim().min(1).max(100),
  orden: z.number().int().nonnegative().default(0),
  tipo: z.nativeEnum(TipoModificadorGrupo).default(TipoModificadorGrupo.UNICA),
  obligatorio: z.boolean().default(true),
  opciones: z.array(comboGrupoOpcionInput).min(1).max(50),
});

export const setComboInput = z.object({
  descripcion: z.string().trim().max(500).optional(),
  grupos: z.array(comboGrupoInput).min(1).max(20),
});

export type ListarProductosQuery = z.infer<typeof listarProductosQuery>;
export type CrearCategoriaInput = z.infer<typeof crearCategoriaInput>;
export type ActualizarCategoriaInput = z.infer<typeof actualizarCategoriaInput>;
export type CrearProductoInput = z.infer<typeof crearProductoInput>;
export type ActualizarProductoInput = z.infer<typeof actualizarProductoInput>;
export type SetPrecioSucursalInput = z.infer<typeof setPrecioSucursalInput>;
export type SetRecetaInput = z.infer<typeof setRecetaInput>;
export type ItemRecetaInput = z.infer<typeof itemRecetaInput>;
export type SetComboInput = z.infer<typeof setComboInput>;
export type ComboGrupoInput = z.infer<typeof comboGrupoInput>;
export type ComboGrupoOpcionInput = z.infer<typeof comboGrupoOpcionInput>;
