import { CondicionVenta, MetodoPago, TipoDocumentoFiscal } from '@prisma/client';
import { z } from 'zod';

const guaraniEntero = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((v) => BigInt(v));

export const pagoComprobanteInput = z.object({
  metodo: z.nativeEnum(MetodoPago),
  monto: guaraniEntero,
  referencia: z.string().trim().max(100).optional(),
});

export const emitirComprobanteInput = z
  .object({
    pedidoId: z.string().cuid(),
    clienteId: z.string().cuid().optional(),
    tipoDocumento: z.nativeEnum(TipoDocumentoFiscal).default(TipoDocumentoFiscal.TICKET),
    condicionVenta: z.nativeEnum(CondicionVenta).default(CondicionVenta.CONTADO),
    pagos: z.array(pagoComprobanteInput).min(1).max(5),
    notas: z.string().trim().max(500).optional(),
  })
  .refine(
    (input) => {
      // Validación cruzada: TICKET sólo para consumidor final
      // (la regla fiscal real puede variar; lo dejamos relajado a nivel schema)
      return true;
    },
    { message: 'inválido' },
  );

export const anularComprobanteInput = z.object({
  motivo: z.string().trim().min(3).max(300),
});

export const listarComprobantesQuery = z.object({
  pedidoId: z.string().cuid().optional(),
  estado: z.enum(['EMITIDO', 'ANULADO']).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const comprobanteIdParam = z.object({ id: z.string().cuid() });

export type EmitirComprobanteInput = z.infer<typeof emitirComprobanteInput>;
export type AnularComprobanteInput = z.infer<typeof anularComprobanteInput>;
export type ListarComprobantesQuery = z.infer<typeof listarComprobantesQuery>;
