import { z } from 'zod';

const guaraniEntero = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((v) => BigInt(v));

const guaraniSigned = z
  .union([z.number().int(), z.string().regex(/^-?\d+$/)])
  .transform((v) => BigInt(v));

export const abrirCajaSchema = z.object({
  montoInicial: guaraniEntero,
  notas: z.string().trim().max(500).optional(),
});

export const cerrarCajaSchema = z.object({
  totalContadoEfectivo: guaraniEntero,
  // jsonb: { "100000": 5, "50000": 10, ... } — denominación → cantidad
  conteoEfectivo: z.record(z.string(), z.number().int().nonnegative()).optional(),
  notas: z.string().trim().max(1000).optional(),
});

export const movimientoCajaSchema = z.object({
  tipo: z.enum(['INGRESO_EXTRA', 'EGRESO', 'RETIRO_PARCIAL']),
  monto: guaraniEntero,
  // Por simplicidad los movimientos manuales son siempre en efectivo;
  // los pagos por otros métodos vienen de comprobantes.
  metodoPago: z.literal('EFECTIVO').default('EFECTIVO'),
  concepto: z.string().trim().min(1).max(200),
});

export const cajaIdParam = z.object({ cajaId: z.string().cuid() });
export const aperturaIdParam = z.object({ aperturaId: z.string().cuid() });
export const cierreIdParam = z.object({ cierreId: z.string().cuid() });

export const listarCierresQuery = z.object({
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  cajaId: z.string().cuid().optional(),
  usuarioId: z.string().cuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// ───── CRUD admin ─────

export const crearCajaInput = z.object({
  sucursalId: z.string().cuid(),
  nombre: z.string().trim().min(1).max(80),
  puntoExpedicionId: z.string().cuid().nullable().optional(),
});

export const actualizarCajaInput = z.object({
  nombre: z.string().trim().min(1).max(80).optional(),
  puntoExpedicionId: z.string().cuid().nullable().optional(),
  activa: z.boolean().optional(),
});

export const cajaAdminIdParam = z.object({ id: z.string().cuid() });

export const listarCajasQuery = z.object({
  incluirInactivas: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .transform((v) => v === true || v === 'true')
    .optional(),
});

// helpers tipados
void guaraniSigned;

export type AbrirCajaInput = z.infer<typeof abrirCajaSchema>;
export type CerrarCajaInput = z.infer<typeof cerrarCajaSchema>;
export type MovimientoCajaInput = z.infer<typeof movimientoCajaSchema>;
export type CrearCajaInput = z.infer<typeof crearCajaInput>;
export type ActualizarCajaInput = z.infer<typeof actualizarCajaInput>;
export type ListarCierresQuery = z.infer<typeof listarCierresQuery>;
