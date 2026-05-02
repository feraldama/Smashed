import { z } from 'zod';

export const crearSucursalInput = z.object({
  nombre: z.string().trim().min(2).max(120),
  codigo: z.string().trim().min(2).max(20).toUpperCase(),
  /** Establecimiento SIFEN: 3 dígitos. */
  establecimiento: z.string().regex(/^\d{3}$/, 'Establecimiento debe ser 3 dígitos'),
  direccion: z.string().trim().min(3).max(300),
  ciudad: z.string().trim().max(100).optional(),
  departamento: z.string().trim().max(100).optional(),
  telefono: z.string().trim().max(40).optional(),
  email: z.string().email().toLowerCase().trim().optional().or(z.literal('').transform(() => undefined)),
  zonaHoraria: z.string().trim().max(60).optional(),
});

export const actualizarSucursalInput = z.object({
  nombre: z.string().trim().min(2).max(120).optional(),
  codigo: z.string().trim().min(2).max(20).toUpperCase().optional(),
  establecimiento: z.string().regex(/^\d{3}$/).optional(),
  direccion: z.string().trim().min(3).max(300).optional(),
  ciudad: z.string().trim().max(100).nullable().optional(),
  departamento: z.string().trim().max(100).nullable().optional(),
  telefono: z.string().trim().max(40).nullable().optional(),
  email: z
    .string()
    .email()
    .toLowerCase()
    .trim()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  zonaHoraria: z.string().trim().max(60).nullable().optional(),
  activa: z.boolean().optional(),
});

export const sucursalIdParam = z.object({ id: z.string().cuid() });

export type CrearSucursalInput = z.infer<typeof crearSucursalInput>;
export type ActualizarSucursalInput = z.infer<typeof actualizarSucursalInput>;
