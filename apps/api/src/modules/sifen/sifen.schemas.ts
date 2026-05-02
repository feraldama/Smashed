import { z } from 'zod';

export const comprobanteIdParam = z.object({ id: z.string().cuid() });

export const cancelarSifenInput = z.object({
  motivo: z.string().trim().min(5).max(500),
});

export type CancelarSifenInput = z.infer<typeof cancelarSifenInput>;
