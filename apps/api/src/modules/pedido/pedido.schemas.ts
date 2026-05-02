import { TipoPedido } from '@prisma/client';
import { z } from 'zod';

const cantidadEntera = z.number().int().min(1).max(999);

export const itemModificadorInput = z.object({
  modificadorOpcionId: z.string().cuid(),
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

export const crearPedidoInput = z.object({
  tipo: z.nativeEnum(TipoPedido),
  clienteId: z.string().cuid().optional(),
  mesaId: z.string().cuid().optional(),
  direccionEntregaId: z.string().cuid().optional(),
  observaciones: z.string().trim().max(500).optional(),
  items: z.array(itemPedidoInput).min(1).max(100),
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
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const pedidoIdParam = z.object({ id: z.string().cuid() });

export type CrearPedidoInput = z.infer<typeof crearPedidoInput>;
export type ItemPedidoInput = z.infer<typeof itemPedidoInput>;
export type TransicionEstadoInput = z.infer<typeof transicionEstadoInput>;
export type CancelarPedidoInput = z.infer<typeof cancelarPedidoInput>;
export type AgregarItemsInput = z.infer<typeof agregarItemsInput>;
export type ListarPedidosQuery = z.infer<typeof listarPedidosQuery>;
