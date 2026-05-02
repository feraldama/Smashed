import { calcularDvRuc } from '@smash/shared-utils';
import { z } from 'zod';


const rucBase = z
  .object({
    ruc: z
      .string()
      .trim()
      .regex(/^\d{1,8}$/, 'RUC debe ser numérico (1-8 dígitos)')
      .optional(),
    dv: z.string().trim().regex(/^\d$/).optional(),
  })
  .refine(
    (data) => {
      if (!data.ruc && !data.dv) return true;
      if (data.ruc && data.dv) {
        return calcularDvRuc(data.ruc) === Number.parseInt(data.dv, 10);
      }
      return false;
    },
    { message: 'RUC y DV deben ser válidos', path: ['dv'] },
  );

export const crearProveedorInput = z
  .object({
    razonSocial: z.string().trim().min(1).max(200),
    email: z
      .string()
      .trim()
      .email()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    telefono: z.string().trim().max(30).optional(),
    direccion: z.string().trim().max(300).optional(),
    contacto: z.string().trim().max(150).optional(),
    notas: z.string().trim().max(1000).optional(),
  })
  .and(rucBase);

export const actualizarProveedorInput = z
  .object({
    razonSocial: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().nullable().optional(),
    telefono: z.string().trim().max(30).nullable().optional(),
    direccion: z.string().trim().max(300).nullable().optional(),
    contacto: z.string().trim().max(150).nullable().optional(),
    notas: z.string().trim().max(1000).nullable().optional(),
    activo: z.boolean().optional(),
  })
  .and(rucBase);

export const listarProveedoresQuery = z.object({
  busqueda: z.string().trim().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const proveedorIdParam = z.object({ id: z.string().cuid() });

export type CrearProveedorInput = z.infer<typeof crearProveedorInput>;
export type ActualizarProveedorInput = z.infer<typeof actualizarProveedorInput>;
