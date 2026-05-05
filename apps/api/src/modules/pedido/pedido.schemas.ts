import { SectorComanda, TipoPedido } from '@prisma/client';
import { z } from 'zod';

const cantidadEntera = z.number().int().min(1).max(999);

export const itemModificadorInput = z.object({
  modificadorOpcionId: z.string().cuid(),
  /** Si el modificador aplica a un componente específico de un combo
   * (ej: "sin cebolla" sólo a la hamburguesa del combo, no al item global),
   * este es el id del ComboGrupo. Omitir si aplica al item entero. */
  comboGrupoId: z.string().cuid().optional(),
});

export const itemComboOpcionInput = z.object({
  comboGrupoId: z.string().cuid(),
  comboGrupoOpcionId: z.string().cuid(),
});

export const itemPedidoInput = z.object({
  productoVentaId: z.string().cuid(),
  cantidad: cantidadEntera,
  observaciones: z.string().trim().max(300).optional(),
  modificadores: z.array(itemModificadorInput).max(20).optional(),
  combosOpcion: z.array(itemComboOpcionInput).max(20).optional(),
});

export const crearPedidoInput = z
  .object({
    tipo: z.nativeEnum(TipoPedido),
    clienteId: z.string().cuid().optional(),
    mesaId: z.string().cuid().optional(),
    direccionEntregaId: z.string().cuid().optional(),
    observaciones: z.string().trim().max(500).optional(),
    items: z.array(itemPedidoInput).min(1).max(100),
  })
  .superRefine((d, ctx) => {
    // Pedidos en MESA exigen mesaId — si no, no hay forma de cobrar la
    // cuenta abierta ni de mostrar el pedido en el plano de salón.
    if (d.tipo === 'MESA' && !d.mesaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mesaId'],
        message: 'Pedidos de tipo MESA requieren `mesaId`',
      });
    }
    // Delivery exige cliente + dirección — sin esto el repartidor no sabe
    // adónde ir y el comprobante queda con receptor "consumidor final"
    // sin sentido logístico.
    const esDelivery = d.tipo === 'DELIVERY_PROPIO' || d.tipo === 'DELIVERY_PEDIDOSYA';
    if (esDelivery && !d.clienteId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clienteId'],
        message: 'Pedidos de delivery requieren `clienteId`',
      });
    }
    if (esDelivery && !d.direccionEntregaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['direccionEntregaId'],
        message: 'Pedidos de delivery requieren `direccionEntregaId`',
      });
    }
    // Si llega `direccionEntregaId` sin `clienteId`, no podemos validar
    // pertenencia (la dirección cuelga del cliente).
    if (d.direccionEntregaId && !d.clienteId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['clienteId'],
        message: '`direccionEntregaId` requiere también `clienteId` para verificar pertenencia',
      });
    }
    // Mesa no debería tener dirección de entrega — el cliente come en el
    // local. Permitirlo crea data sucia que confunde reportes y delivery.
    if (d.tipo === 'MESA' && d.direccionEntregaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['direccionEntregaId'],
        message: 'Un pedido de MESA no puede tener `direccionEntregaId`',
      });
    }
    // Mostrador/Retiro tampoco usan dirección de entrega.
    if ((d.tipo === 'MOSTRADOR' || d.tipo === 'RETIRO_LOCAL') && d.direccionEntregaId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['direccionEntregaId'],
        message: 'Solo los pedidos de delivery pueden llevar `direccionEntregaId`',
      });
    }
  });

export const transicionEstadoInput = z.object({
  estado: z.enum(['CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO', 'ENTREGADO', 'FACTURADO']),
});

export const cancelarPedidoInput = z.object({
  motivo: z.string().trim().min(3).max(300),
});

export const agregarItemsInput = z.object({
  items: z.array(itemPedidoInput).min(1).max(50),
});

export const itemEstadoInput = z.object({
  estado: z.enum(['EN_PREPARACION', 'LISTO']),
});

export const itemIdParam = z.object({
  id: z.string().cuid(),
  itemId: z.string().cuid(),
});

export const comboOpcionIdParam = z.object({
  id: z.string().cuid(),
  comboOpcionId: z.string().cuid(),
});

export const kdsQuery = z.object({
  sector: z.nativeEnum(SectorComanda).optional(),
});

export const listarPedidosQuery = z.object({
  estado: z
    .enum([
      'PENDIENTE',
      'CONFIRMADO',
      'EN_PREPARACION',
      'LISTO',
      'EN_CAMINO',
      'ENTREGADO',
      'FACTURADO',
      'CANCELADO',
    ])
    .optional(),
  tipo: z.nativeEnum(TipoPedido).optional(),
  desde: z.coerce.date().optional(),
  hasta: z.coerce.date().optional(),
  busqueda: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const pedidoIdParam = z.object({ id: z.string().cuid() });

export type CrearPedidoInput = z.infer<typeof crearPedidoInput>;
export type ItemPedidoInput = z.infer<typeof itemPedidoInput>;
export type TransicionEstadoInput = z.infer<typeof transicionEstadoInput>;
export type CancelarPedidoInput = z.infer<typeof cancelarPedidoInput>;
export type AgregarItemsInput = z.infer<typeof agregarItemsInput>;
export type ListarPedidosQuery = z.infer<typeof listarPedidosQuery>;
