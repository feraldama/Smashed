import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export type TipoPedido =
  | 'MOSTRADOR'
  | 'MESA'
  | 'DELIVERY_PROPIO'
  | 'DELIVERY_PEDIDOSYA'
  | 'RETIRO_LOCAL';
export type EstadoPedido =
  | 'PENDIENTE'
  | 'CONFIRMADO'
  | 'EN_PREPARACION'
  | 'LISTO'
  | 'EN_CAMINO'
  | 'ENTREGADO'
  | 'FACTURADO'
  | 'CANCELADO';

export interface ItemPedidoInput {
  productoVentaId: string;
  cantidad: number;
  observaciones?: string;
  /** Si el modificador aplica a un componente del combo (no al item global),
   * `comboGrupoId` apunta al ComboGrupo correspondiente. */
  modificadores?: { modificadorOpcionId: string; comboGrupoId?: string }[];
  combosOpcion?: { comboGrupoId: string; comboGrupoOpcionId: string }[];
}

export interface CrearPedidoInput {
  tipo: TipoPedido;
  clienteId?: string;
  mesaId?: string;
  direccionEntregaId?: string;
  observaciones?: string;
  items: ItemPedidoInput[];
}

export interface PedidoResult {
  id: string;
  numero: number;
  tipo: TipoPedido;
  estado: EstadoPedido;
  total: string;
  subtotal: string;
  totalIva: string;
}

export function useCrearPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearPedidoInput) =>
      api<{ pedido: PedidoResult }>('/pedidos', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'pedidos'] });
    },
  });
}

export function useConfirmarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ pedido: PedidoResult }>(`/pedidos/${id}/confirmar`, { method: 'POST' }),
    onSuccess: (_d, id) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'pedidos'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'pedido', id] });
    },
  });
}

export function useAgregarItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pedidoId, items }: { pedidoId: string; items: ItemPedidoInput[] }) =>
      api<{ pedido: PedidoResult }>(`/pedidos/${pedidoId}/items`, {
        method: 'POST',
        body: { items },
      }),
    onSuccess: (_d, { pedidoId }) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'pedidos'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'pedido', pedidoId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'mesas'] });
      void qc.invalidateQueries({ queryKey: ['kds', 'pedidos'] });
    },
  });
}

export function useTransicionarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoPedido }) =>
      api<{ pedido: PedidoResult }>(`/pedidos/${id}/estado`, {
        method: 'PATCH',
        body: { estado },
      }),
    onSuccess: (_d, { id }) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'pedidos'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'pedido', id] });
      void qc.invalidateQueries({ queryKey: ['admin', 'mesas'] });
      void qc.invalidateQueries({ queryKey: ['kds', 'pedidos'] });
      void qc.invalidateQueries({ queryKey: ['pedidos', 'listos'] });
    },
  });
}

// ───── Pedidos listados para vista de entregas ─────

export interface PedidoListItem {
  id: string;
  numero: number;
  tipo: TipoPedido;
  estado: EstadoPedido;
  total: string;
  numeroPager: number | null;
  createdAt: string;
  cliente: { id: string; razonSocial: string } | null;
  mesa: { id: string; numero: number } | null;
  _count: { items: number };
}

export function usePedidosPorEstado(estado: EstadoPedido) {
  return useQuery({
    queryKey: ['admin', 'pedidos', 'estado', estado],
    queryFn: () => api<{ pedidos: PedidoListItem[] }>(`/pedidos?estado=${estado}&pageSize=100`),
    select: (d) => d.pedidos,
    refetchInterval: 5_000,
  });
}
