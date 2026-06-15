import { z } from 'zod';

const credencialesAmbiente = z.object({
  dominio: z.string().url('Debe ser una URL válida (ej. https://ws.futura100.com.py)'),
  ruc: z
    .string()
    .trim()
    .min(3)
    .max(8)
    .regex(/^\d+$/, 'El RUC debe ser numérico sin dígito verificador'),
  // Opcional en update: si no viene, se conserva el password existente.
  password: z.string().min(1).optional(),
});

/** Cuerpo para crear/actualizar la configuración de facturación de la empresa. */
export const guardarConfiguracionSchema = z
  .object({
    proveedor: z.literal('CODE100').optional(),
    ambienteActivo: z.enum(['TEST', 'PROD']).optional(),
    emisorTipoContribuyente: z.union([z.literal(1), z.literal(2)]).optional(),
    activo: z.boolean().optional(),
    test: credencialesAmbiente.optional(),
    prod: credencialesAmbiente.optional(),
  })
  .refine((v) => v.test || v.prod || v.ambienteActivo || v.activo !== undefined, {
    message: 'No hay nada para guardar',
  });

export type GuardarConfiguracionBody = z.infer<typeof guardarConfiguracionSchema>;

export const comprobanteIdParam = z.object({ id: z.string().min(1) });

export const cancelarSchema = z.object({
  motivo: z.string().trim().min(5, 'El motivo debe tener al menos 5 caracteres').max(500),
});

export const kudeQuery = z.object({
  ticket: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
