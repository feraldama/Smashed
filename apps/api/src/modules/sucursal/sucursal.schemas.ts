import { z } from 'zod';

export const tipoRecargoDeliverySchema = z.enum(['PORCENTAJE', 'MONTO']);

// Bounds: porcentaje 0-100% (10000 centésimos), monto hasta 10M Gs.
// El backend persiste BigInt; en el wire usamos number entero.
const recargoValorSchema = z.number().int().min(0).max(10_000_000);

export const crearSucursalInput = z
  .object({
    nombre: z.string().trim().min(2).max(120),
    codigo: z.string().trim().min(2).max(20).toUpperCase(),
    /** Establecimiento SIFEN: 3 dígitos. Opcional cuando esDeposito=true. */
    establecimiento: z
      .string()
      .regex(/^\d{3}$/, 'Establecimiento debe ser 3 dígitos')
      .optional(),
    /** Depósito: sólo inventario, no vende ni factura. */
    esDeposito: z.boolean().optional().default(false),
    direccion: z.string().trim().min(3).max(300),
    ciudad: z.string().trim().max(100).optional(),
    departamento: z.string().trim().max(100).optional(),
    telefono: z.string().trim().max(40).optional(),
    email: z
      .string()
      .email()
      .toLowerCase()
      .trim()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    zonaHoraria: z.string().trim().max(60).optional(),
  })
  // El establecimiento SIFEN sólo es obligatorio para sucursales que venden.
  // Un depósito no factura, así que lo dejamos vacío.
  .refine((d) => d.esDeposito || Boolean(d.establecimiento), {
    message: 'Establecimiento es obligatorio para una sucursal que vende',
    path: ['establecimiento'],
  });

export const actualizarSucursalInput = z.object({
  nombre: z.string().trim().min(2).max(120).optional(),
  codigo: z.string().trim().min(2).max(20).toUpperCase().optional(),
  establecimiento: z
    .string()
    .regex(/^\d{3}$/)
    .nullable()
    .optional(),
  esDeposito: z.boolean().optional(),
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
  deliveryRecargoActivo: z.boolean().optional(),
  deliveryRecargoTipo: tipoRecargoDeliverySchema.optional(),
  // Si tipo=PORCENTAJE el wire manda centésimos del 1% (10000 = 100%).
  // Si tipo=MONTO el wire manda guaraníes enteros.
  deliveryRecargoValor: recargoValorSchema.optional(),
});

export const sucursalIdParam = z.object({ id: z.string().cuid() });

export type CrearSucursalInput = z.infer<typeof crearSucursalInput>;
export type ActualizarSucursalInput = z.infer<typeof actualizarSucursalInput>;
