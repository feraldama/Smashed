import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color hex inválido (#RRGGBB)')
  .nullable()
  .optional();

export const actualizarEmpresaInput = z.object({
  nombreFantasia: z.string().trim().min(2).max(120).optional(),
  razonSocial: z.string().trim().min(2).max(200).optional(),
  ruc: z.string().regex(/^\d{6,8}$/, 'RUC debe tener 6-8 dígitos').optional(),
  dv: z.string().regex(/^\d$/, 'DV debe ser 1 dígito').optional(),
  direccion: z.string().trim().max(300).nullable().optional(),
  telefono: z.string().trim().max(40).nullable().optional(),
  email: z
    .string()
    .email()
    .toLowerCase()
    .trim()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  logoUrl: z.string().url().nullable().optional().or(z.literal('').transform(() => null)),
  colorPrimario: hexColor,
  colorSecundario: hexColor,
  zonaHoraria: z.string().trim().min(3).max(60).optional(),
});

export const actualizarConfiguracionInput = z.object({
  permitirStockNegativo: z.boolean().optional(),
  redondearTotales: z.boolean().optional(),
  ivaIncluidoEnPrecio: z.boolean().optional(),
  emitirTicketPorDefecto: z.boolean().optional(),
});

export type ActualizarEmpresaInput = z.infer<typeof actualizarEmpresaInput>;
export type ActualizarConfiguracionInput = z.infer<typeof actualizarConfiguracionInput>;
