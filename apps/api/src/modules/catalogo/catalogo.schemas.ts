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

const productoBaseInput = z.object({
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
  // Orden dentro de la categoría en el menú del POS. Normalmente se gestiona
  // desde la pantalla de reordenamiento (drag & drop), no desde el alta.
  ordenMenu: z.number().int().nonnegative().optional(),
  // Reventa: vínculo a un insumo para imputar costo y descontar stock al vender
  // (bebidas envasadas, snacks). XOR con receta — validado en el service.
  // `null` explícito desvincula; `undefined` deja como está (en update).
  // `cantidadInventario` = unidades del insumo por unidad vendida (> 0 si hay
  // insumo vinculado).
  productoInventarioId: z.string().cuid().nullable().optional(),
  cantidadInventario: z.number().positive().max(99_999_999).nullable().optional(),
});

// Reglas de reventa que no dependen de la BD (las que sí, van en el service).
function checkReventa(
  d: {
    productoInventarioId?: string | null;
    cantidadInventario?: number | null;
    esCombo?: boolean;
    esPreparacion?: boolean;
  },
  ctx: z.RefinementCtx,
) {
  if (!d.productoInventarioId) return;
  if (d.cantidadInventario == null || d.cantidadInventario <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Indicá la cantidad de insumo por unidad vendida (> 0)',
      path: ['cantidadInventario'],
    });
  }
  if (d.esCombo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Un combo no puede ser producto de reventa',
      path: ['productoInventarioId'],
    });
  }
  if (d.esPreparacion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Una preparación no puede ser producto de reventa',
      path: ['productoInventarioId'],
    });
  }
}

export const crearProductoInput = productoBaseInput.superRefine(checkReventa);

export const actualizarProductoInput = productoBaseInput
  .partial()
  .extend({ activo: z.boolean().optional() })
  .superRefine(checkReventa);

export const productoIdParam = z.object({ id: z.string().cuid() });

// Reordenamiento en lote: los ids vienen en el orden deseado (0..n-1).
export const reordenarProductosInput = z.object({
  ids: z.array(z.string().cuid()).min(1).max(500),
});

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
  unidadRinde: z.nativeEnum(UnidadMedida).default(UnidadMedida.UNIDAD),
  notas: z.string().trim().max(500).optional(),
  items: z.array(itemRecetaInput).min(1).max(50),
});

export const listarRecetasQuery = z.object({
  busqueda: z.string().trim().min(1).optional(),
  // 'TODOS' (default) | 'SUB' (solo sub-preparaciones) | 'VENDIBLE' (solo productos vendibles).
  filtro: z.enum(['TODOS', 'SUB', 'VENDIBLE']).default('TODOS'),
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
export type ReordenarProductosInput = z.infer<typeof reordenarProductosInput>;
export type SetPrecioSucursalInput = z.infer<typeof setPrecioSucursalInput>;
export type SetRecetaInput = z.infer<typeof setRecetaInput>;
export type ItemRecetaInput = z.infer<typeof itemRecetaInput>;
export type ListarRecetasQuery = z.infer<typeof listarRecetasQuery>;
export type SetComboInput = z.infer<typeof setComboInput>;
export type ComboGrupoInput = z.infer<typeof comboGrupoInput>;
export type ComboGrupoOpcionInput = z.infer<typeof comboGrupoOpcionInput>;
