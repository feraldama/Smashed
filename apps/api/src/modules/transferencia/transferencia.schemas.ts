import { z } from 'zod';

export const itemTransferenciaInput = z.object({
  productoInventarioId: z.string().cuid(),
  cantidad: z.coerce.number().positive('Cantidad debe ser > 0').max(99_999_999),
});

export const crearTransferenciaInput = z
  .object({
    sucursalOrigenId: z.string().cuid(),
    sucursalDestinoId: z.string().cuid(),
    notas: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    items: z.array(itemTransferenciaInput).min(1, 'Necesitás al menos un item'),
  })
  .refine((d) => d.sucursalOrigenId !== d.sucursalDestinoId, {
    message: 'Origen y destino deben ser sucursales distintas',
    path: ['sucursalDestinoId'],
  });

export const listarTransferenciasQuery = z.object({
  sucursalOrigenId: z.string().cuid().optional(),
  sucursalDestinoId: z.string().cuid().optional(),
  fechaDesde: z.string().datetime().optional(),
  fechaHasta: z.string().datetime().optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().cuid().optional(),
});

export const transferenciaIdParam = z.object({ id: z.string().cuid() });

export type CrearTransferenciaInput = z.infer<typeof crearTransferenciaInput>;
export type ListarTransferenciasQuery = z.infer<typeof listarTransferenciasQuery>;
