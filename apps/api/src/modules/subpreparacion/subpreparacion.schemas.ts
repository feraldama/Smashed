import { ModoStockReceta, UnidadMedida } from '@prisma/client';
import { z } from 'zod';

export const subpreparacionIdParam = z.object({ id: z.string().cuid() });

export const listarSubpreparacionesQuery = z.object({
  sucursalId: z.string().cuid().optional(),
  busqueda: z.string().trim().min(1).optional(),
});

// Cambio de modo de stock. Si pasa a LOTE:
//  - productoInventarioId opcional: si se pasa, vincula a un PI existente.
//  - Si no se pasa, el service crea un PI espejo automáticamente con el mismo
//    nombre que la subpreparación y unidad UNIDAD por default (overridable).
export const cambiarModoStockInput = z.object({
  modoStock: z.nativeEnum(ModoStockReceta),
  // Para LOTE — vincular a un PI existente (opcional).
  productoInventarioId: z.string().cuid().nullable().optional(),
  // Para LOTE sin PI existente — unidad del espejo a crear (default UNIDAD).
  unidadMedidaEspejo: z.nativeEnum(UnidadMedida).optional(),
});

export const producirLoteInput = z.object({
  sucursalId: z.string().cuid(),
  // Cantidad de "porciones" (en unidades del PI espejo) a producir.
  cantidad: z.number().positive().max(1_000_000),
  notas: z.string().trim().max(500).optional(),
});

export type CambiarModoStockInput = z.infer<typeof cambiarModoStockInput>;
export type ProducirLoteInput = z.infer<typeof producirLoteInput>;
export type ListarSubpreparacionesQuery = z.infer<typeof listarSubpreparacionesQuery>;
