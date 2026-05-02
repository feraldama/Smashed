import { EstadoMesa } from '@prisma/client';
import { z } from 'zod';

export const cambiarEstadoMesaInput = z.object({
  estado: z.nativeEnum(EstadoMesa),
});

export const mesaIdParam = z.object({ id: z.string().cuid() });

export type CambiarEstadoMesaInput = z.infer<typeof cambiarEstadoMesaInput>;
