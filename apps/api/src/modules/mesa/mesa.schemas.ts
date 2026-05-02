import { EstadoMesa } from '@prisma/client';
import { z } from 'zod';

export const cambiarEstadoMesaInput = z.object({
  estado: z.nativeEnum(EstadoMesa),
});

export const mesaIdParam = z.object({ id: z.string().cuid() });

// ───── Zonas ─────

export const crearZonaInput = z.object({
  sucursalId: z.string().cuid(),
  nombre: z.string().trim().min(1).max(80),
  orden: z.number().int().min(0).max(9999).optional(),
});

export const actualizarZonaInput = z.object({
  nombre: z.string().trim().min(1).max(80).optional(),
  orden: z.number().int().min(0).max(9999).optional(),
});

// ───── Mesas ─────

export const crearMesaInput = z.object({
  zonaMesaId: z.string().cuid(),
  numero: z.number().int().min(1).max(9999),
  capacidad: z.number().int().min(1).max(99).optional(),
});

export const actualizarMesaInput = z.object({
  zonaMesaId: z.string().cuid().optional(),
  numero: z.number().int().min(1).max(9999).optional(),
  capacidad: z.number().int().min(1).max(99).optional(),
});

export type CambiarEstadoMesaInput = z.infer<typeof cambiarEstadoMesaInput>;
export type CrearZonaInput = z.infer<typeof crearZonaInput>;
export type ActualizarZonaInput = z.infer<typeof actualizarZonaInput>;
export type CrearMesaInput = z.infer<typeof crearMesaInput>;
export type ActualizarMesaInput = z.infer<typeof actualizarMesaInput>;
