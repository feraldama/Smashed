import { TipoContribuyente } from '@prisma/client';
import { calcularDvRuc } from '@smash/shared-utils';
import { z } from 'zod';


// ───── Cliente ─────

const rucBase = z
  .object({
    ruc: z
      .string()
      .trim()
      .regex(/^\d{1,8}$/, 'RUC debe ser numérico (1-8 dígitos)')
      .optional(),
    dv: z.string().trim().regex(/^\d$/, 'DV debe ser un dígito').optional(),
  })
  .refine(
    (data) => {
      if (!data.ruc && !data.dv) return true;
      if (data.ruc && data.dv) {
        const calculado = calcularDvRuc(data.ruc);
        return calculado === Number.parseInt(data.dv, 10);
      }
      return false;
    },
    { message: 'RUC y DV deben venir juntos y el DV debe ser válido', path: ['dv'] },
  );

export const crearClienteInput = z
  .object({
    tipoContribuyente: z.nativeEnum(TipoContribuyente),
    razonSocial: z.string().trim().min(1).max(200),
    nombreFantasia: z.string().trim().max(200).optional(),
    documento: z.string().trim().max(20).optional(),
    email: z
      .string()
      .trim()
      .email()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    telefono: z.string().trim().max(30).optional(),
    esConsumidorFinal: z.boolean().default(false),
  })
  .and(rucBase);

export const actualizarClienteInput = z
  .object({
    tipoContribuyente: z.nativeEnum(TipoContribuyente).optional(),
    razonSocial: z.string().trim().min(1).max(200).optional(),
    nombreFantasia: z.string().trim().max(200).nullable().optional(),
    documento: z.string().trim().max(20).nullable().optional(),
    email: z.string().trim().email().nullable().optional(),
    telefono: z.string().trim().max(30).nullable().optional(),
  })
  .and(rucBase);

export const listarClientesQuery = z.object({
  busqueda: z.string().trim().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const clienteIdParam = z.object({ id: z.string().cuid() });

// ───── Direcciones ─────

export const direccionInput = z.object({
  alias: z.string().trim().max(50).optional(),
  direccion: z.string().trim().min(1).max(300),
  ciudad: z.string().trim().max(100).optional(),
  departamento: z.string().trim().max(100).optional(),
  referencias: z.string().trim().max(300).optional(),
  latitud: z.number().min(-90).max(90).optional(),
  longitud: z.number().min(-180).max(180).optional(),
  esPrincipal: z.boolean().default(false),
});

export const direccionIdParam = z.object({
  id: z.string().cuid(),
  dirId: z.string().cuid(),
});

export type CrearClienteInput = z.infer<typeof crearClienteInput>;
export type ActualizarClienteInput = z.infer<typeof actualizarClienteInput>;
export type DireccionInput = z.infer<typeof direccionInput>;
