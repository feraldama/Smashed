import { TipoModificadorGrupo } from '@prisma/client';
import { z } from 'zod';

// Campos de vínculo de stock, compartidos por crear/actualizar opción. XOR: o
// un ProductoVenta o un insumo (ProductoInventario), nunca ambos. null explícito
// desvincula; undefined deja como está (en update).
const vinculoStockShape = {
  productoVentaId: z.string().cuid().nullable().optional(),
  productoInventarioId: z.string().cuid().nullable().optional(),
  // Cantidad del insumo a descontar (en la unidad del insumo). Obligatoria y > 0
  // cuando se vincula un insumo.
  cantidadInventario: z.number().positive().max(99_999_999).nullable().optional(),
};

function checkVinculoStock(
  d: {
    productoVentaId?: string | null;
    productoInventarioId?: string | null;
    cantidadInventario?: number | null;
  },
  ctx: z.RefinementCtx,
) {
  if (d.productoVentaId && d.productoInventarioId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'No se puede vincular a un producto y a un insumo a la vez',
      path: ['productoInventarioId'],
    });
  }
  if (d.productoInventarioId && (d.cantidadInventario == null || d.cantidadInventario <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Indicá la cantidad de insumo a descontar (> 0)',
      path: ['cantidadInventario'],
    });
  }
}

const opcionBaseInput = z.object({
  nombre: z.string().trim().min(1).max(150),
  precioExtra: z.number().int().min(0).max(99_999_999).optional(),
  orden: z.number().int().min(0).max(9999).optional(),
  activo: z.boolean().optional(),
  ...vinculoStockShape,
});

export const crearGrupoInput = z
  .object({
    nombre: z.string().trim().min(1).max(150),
    tipo: z.nativeEnum(TipoModificadorGrupo).default('MULTIPLE'),
    obligatorio: z.boolean().default(false),
    minSeleccion: z.number().int().min(0).max(99).default(0),
    maxSeleccion: z.number().int().min(1).max(99).nullable().optional(),
    opciones: z.array(opcionBaseInput.superRefine(checkVinculoStock)).optional(),
  })
  .refine((d) => d.maxSeleccion == null || d.minSeleccion <= d.maxSeleccion, {
    message: 'minSeleccion no puede ser mayor a maxSeleccion',
    path: ['maxSeleccion'],
  })
  .refine((d) => !d.obligatorio || d.minSeleccion >= 1, {
    message: 'Si es obligatorio, minSeleccion debe ser ≥ 1',
    path: ['minSeleccion'],
  });

export const actualizarGrupoInput = z
  .object({
    nombre: z.string().trim().min(1).max(150).optional(),
    tipo: z.nativeEnum(TipoModificadorGrupo).optional(),
    obligatorio: z.boolean().optional(),
    minSeleccion: z.number().int().min(0).max(99).optional(),
    maxSeleccion: z.number().int().min(1).max(99).nullable().optional(),
  })
  .refine(
    (d) => d.maxSeleccion == null || d.minSeleccion == null || d.minSeleccion <= d.maxSeleccion,
    { message: 'minSeleccion no puede ser mayor a maxSeleccion', path: ['maxSeleccion'] },
  );

export const crearOpcionInput = opcionBaseInput.superRefine(checkVinculoStock);

export const actualizarOpcionInput = z
  .object({
    nombre: z.string().trim().min(1).max(150).optional(),
    precioExtra: z.number().int().min(0).max(99_999_999).optional(),
    orden: z.number().int().min(0).max(9999).optional(),
    activo: z.boolean().optional(),
    ...vinculoStockShape,
  })
  .superRefine(checkVinculoStock);

export const vincularProductoInput = z.object({
  productoVentaId: z.string().cuid(),
  ordenEnProducto: z.number().int().min(0).max(9999).optional(),
});

export const grupoIdParam = z.object({ id: z.string().cuid() });
export const opcionIdParam = z.object({
  id: z.string().cuid(),
  opcionId: z.string().cuid(),
});
export const productoVinculoParam = z.object({
  id: z.string().cuid(),
  productoId: z.string().cuid(),
});

export type CrearGrupoInput = z.infer<typeof crearGrupoInput>;
export type ActualizarGrupoInput = z.infer<typeof actualizarGrupoInput>;
export type CrearOpcionInput = z.infer<typeof crearOpcionInput>;
export type ActualizarOpcionInput = z.infer<typeof actualizarOpcionInput>;
export type VincularProductoInput = z.infer<typeof vincularProductoInput>;
