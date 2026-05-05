import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color hex inválido (#RRGGBB)')
  .optional();

const passwordRule = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128);

/**
 * Sucursal inicial opcional para el wizard de onboarding. Si se incluye, la
 * empresa nueva nace con una sucursal lista para operar (con su punto de
 * expedición default `001`). El admin creado queda asociado a esta sucursal
 * como principal, así puede entrar al POS sin pasos extra.
 */
export const sucursalInicialInput = z.object({
  nombre: z.string().trim().min(2).max(120),
  codigo: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .transform((v) => v.toUpperCase()),
  establecimiento: z.string().regex(/^\d{3}$/, 'Establecimiento debe ser exactamente 3 dígitos'),
  direccion: z.string().trim().min(3).max(300),
  ciudad: z.string().trim().max(80).optional(),
  departamento: z.string().trim().max(80).optional(),
  telefono: z.string().trim().max(40).optional(),
  email: z.string().email().toLowerCase().trim().optional(),
});

export const crearEmpresaInput = z.object({
  // Datos de la empresa
  nombreFantasia: z.string().trim().min(2).max(120),
  razonSocial: z.string().trim().min(2).max(200),
  ruc: z.string().regex(/^\d{6,8}$/, 'RUC debe tener 6-8 dígitos'),
  dv: z.string().regex(/^\d$/, 'DV debe ser 1 dígito'),
  direccion: z.string().trim().max(300).optional(),
  telefono: z.string().trim().max(40).optional(),
  email: z.string().email().toLowerCase().trim().optional(),
  zonaHoraria: z.string().trim().min(3).max(60).default('America/Asuncion'),
  colorPrimario: hexColor,
  colorSecundario: hexColor,

  // Admin inicial
  admin: z.object({
    email: z.string().email().toLowerCase().trim(),
    nombreCompleto: z.string().trim().min(2).max(200),
    // Si no viene, generamos una contraseña aleatoria y la devolvemos en la respuesta.
    password: passwordRule.optional(),
  }),

  // Sucursal inicial opcional (wizard de onboarding).
  sucursalInicial: sucursalInicialInput.optional(),
});

export const listarEmpresasQuery = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  activa: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const cambiarActivaInput = z
  .object({
    activa: z.boolean(),
    motivo: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.activa || (d.motivo && d.motivo.length >= 3), {
    message: 'Al desactivar una empresa hay que indicar un motivo (mín. 3 caracteres)',
    path: ['motivo'],
  });

export type CrearEmpresaInput = z.infer<typeof crearEmpresaInput>;
export type ListarEmpresasQuery = z.infer<typeof listarEmpresasQuery>;
export type CambiarActivaInput = z.infer<typeof cambiarActivaInput>;
