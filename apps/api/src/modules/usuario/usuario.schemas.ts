import { Rol } from '@prisma/client';
import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(72, 'Máximo 72 caracteres') // bcrypt limit
  .regex(/[A-Z]/, 'Requiere al menos una mayúscula')
  .regex(/[a-z]/, 'Requiere al menos una minúscula')
  .regex(/\d/, 'Requiere al menos un número');

export const sucursalAsignacionSchema = z.object({
  sucursalId: z.string().cuid(),
  esPrincipal: z.boolean().default(false),
});

export const crearUsuarioInput = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: passwordSchema,
  nombreCompleto: z.string().trim().min(2).max(120),
  documento: z.string().trim().max(30).optional(),
  telefono: z.string().trim().max(40).optional(),
  rol: z.nativeEnum(Rol),
  sucursales: z.array(sucursalAsignacionSchema).max(20).default([]),
});

export const actualizarUsuarioInput = z.object({
  email: z.string().email().toLowerCase().trim().optional(),
  nombreCompleto: z.string().trim().min(2).max(120).optional(),
  documento: z.string().trim().max(30).nullable().optional(),
  telefono: z.string().trim().max(40).nullable().optional(),
  rol: z.nativeEnum(Rol).optional(),
  activo: z.boolean().optional(),
  sucursales: z.array(sucursalAsignacionSchema).max(20).optional(),
});

export const resetPasswordInput = z.object({
  password: passwordSchema,
});

export const listarUsuariosQuery = z.object({
  busqueda: z.string().trim().optional(),
  rol: z.nativeEnum(Rol).optional(),
  sucursalId: z.string().cuid().optional(),
  incluirInactivos: z.coerce.boolean().default(false),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
});

export const usuarioIdParam = z.object({ id: z.string().cuid() });

export type CrearUsuarioInput = z.infer<typeof crearUsuarioInput>;
export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioInput>;
export type ResetPasswordInput = z.infer<typeof resetPasswordInput>;
export type ListarUsuariosQuery = z.infer<typeof listarUsuariosQuery>;
