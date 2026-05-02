import { z } from 'zod';

export const itemCompraInput = z.object({
  productoInventarioId: z.string().cuid(),
  cantidad: z.coerce.number().positive('Cantidad debe ser > 0').max(99_999_999),
  costoUnitario: z.number().int().min(0, 'Costo no puede ser negativo').max(999_999_999_999),
});

export const crearCompraInput = z.object({
  proveedorId: z.string().cuid(),
  sucursalId: z.string().cuid(),
  fecha: z
    .string()
    .datetime()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  numeroFactura: z
    .string()
    .trim()
    .max(50)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  notas: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  items: z.array(itemCompraInput).min(1, 'Necesitás al menos un item'),
});

export const listarComprasQuery = z.object({
  proveedorId: z.string().cuid().optional(),
  sucursalId: z.string().cuid().optional(),
  fechaDesde: z.string().datetime().optional(),
  fechaHasta: z.string().datetime().optional(),
  numeroFactura: z.string().trim().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().cuid().optional(),
});

export const compraIdParam = z.object({ id: z.string().cuid() });

export type CrearCompraInput = z.infer<typeof crearCompraInput>;
export type ListarComprasQuery = z.infer<typeof listarComprasQuery>;
