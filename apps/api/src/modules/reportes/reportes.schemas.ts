import { z } from 'zod';

const dateString = z.coerce.date();

export const rangoFechasQuery = z.object({
  desde: dateString,
  hasta: dateString,
  sucursalId: z.string().cuid().optional(),
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
});

export type RangoFechasQuery = z.infer<typeof rangoFechasQuery>;
export type TopQuery = z.infer<typeof topQuery>;
export type RentabilidadQuery = z.infer<typeof rentabilidadQuery>;
export type StockQuery = z.infer<typeof stockQuery>;
