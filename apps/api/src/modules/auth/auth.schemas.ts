import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1, 'Password requerido'),
});

export const refreshSchema = z.object({
  // Hint opcional del cliente: la sucursal en la que el usuario estaba operando
  // antes de que expirara el access token. El server valida pertenencia.
  sucursalActivaId: z.string().cuid().optional(),
});

export const seleccionarSucursalSchema = z.object({
  sucursalId: z.string().cuid(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type SeleccionarSucursalInput = z.infer<typeof seleccionarSucursalSchema>;
