import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1, 'Password requerido'),
});

export const refreshSchema = z.object({
  // Hint opcional del cliente: la sucursal en la que el usuario estaba operando
  // antes de que expirara el access token. El server valida pertenencia.
  sucursalActivaId: z.string().cuid().optional(),
  // Hint opcional usado solo por SUPER_ADMIN cuando está en modo "operar como
  // empresa X". Permite que el modo sobreviva al expire del access token. El
  // server valida que la empresa exista y esté activa, si no se ignora.
  empresaIdOperar: z.string().cuid().optional(),
});

export const seleccionarSucursalSchema = z.object({
  sucursalId: z.string().cuid(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type SeleccionarSucursalInput = z.infer<typeof seleccionarSucursalSchema>;
