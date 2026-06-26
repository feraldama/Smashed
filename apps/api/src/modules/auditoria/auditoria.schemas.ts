import { AccionAuditable } from '@prisma/client';
import { z } from 'zod';

/**
 * Filtros del visor de auditoría. Todos opcionales salvo la paginación.
 * El rango de fechas es inclusivo en ambos extremos.
 */
export const listarAuditoriaQuery = z.object({
  accion: z.nativeEnum(AccionAuditable).optional(),
  usuarioId: z.string().cuid().optional(),
  entidad: z.string().trim().min(1).max(50).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListarAuditoriaQuery = z.infer<typeof listarAuditoriaQuery>;
