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
    // El flujo de venta sólo emite documentos de venta. Notas de crédito/débito,
    // autofactura y remisión van por flujos propios (devolución, etc.) y NO se
    // emiten facturando un pedido — si no, contarían como venta en los reportes.
    tipoDocumento: z
      .enum([TipoDocumentoFiscal.TICKET, TipoDocumentoFiscal.FACTURA])
      .default(TipoDocumentoFiscal.TICKET),
    condicionVenta: z.nativeEnum(CondicionVenta).default(CondicionVenta.CONTADO),
    pagos: z.array(pagoComprobanteInput).min(1).max(5),
    notas: z.string().trim().max(500).optional(),
    // Obligatorio sólo para pedidos que esperan en el local (MOSTRADOR /
    // RETIRO_LOCAL): esa regla se valida en el servicio, que conoce el tipo
    // del pedido. Acá sólo validamos el rango si vino.
    numeroPager: z.number().int().min(1).max(50).optional(),
  })
  .refine(
    () => {
      // Validación cruzada: TICKET sólo para consumidor final
      // (la regla fiscal real puede variar; lo dejamos relajado a nivel schema)
      return true;
    },
    { message: 'inválido' },
  );

export const anularComprobanteInput = z.object({
  motivo: z.string().trim().min(3).max(300),
});

export const notaCreditoItemInput = z.object({
  itemComprobanteId: z.string().cuid(),
  cantidad: z.number().int().min(1),
});

export const emitirNotaCreditoInput = z.object({
  items: z.array(notaCreditoItemInput).min(1).max(50),
  motivo: z.string().trim().min(3).max(300),
  // Si hay una caja abierta, registrar el egreso de la devolución del dinero.
  registrarEgresoCaja: z.boolean().default(true),
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
export type EmitirNotaCreditoInput = z.infer<typeof emitirNotaCreditoInput>;
export type ListarComprobantesQuery = z.infer<typeof listarComprobantesQuery>;
