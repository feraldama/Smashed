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
  tomadoPor?: { id: string; nombreCompleto: string } | null;
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

// ───── Listado paginado para histórico (admin) ─────

export interface PedidosListadoFiltros {
  estado?: EstadoPedido;
  tipo?: TipoPedido;
  desde?: string;
  hasta?: string;
  busqueda?: string;
  page?: number;
  pageSize?: number;
}

export function usePedidosListado(filtros: PedidosListadoFiltros = {}) {
  const params = new URLSearchParams();
  if (filtros.estado) params.set('estado', filtros.estado);
  if (filtros.tipo) params.set('tipo', filtros.tipo);
  if (filtros.desde) params.set('desde', filtros.desde);
  if (filtros.hasta) params.set('hasta', filtros.hasta);
  if (filtros.busqueda) params.set('busqueda', filtros.busqueda);
  params.set('page', String(filtros.page ?? 1));
  params.set('pageSize', String(filtros.pageSize ?? 25));
  const qs = params.toString();
  return useQuery({
    queryKey: ['admin', 'pedidos', 'listado', filtros],
    queryFn: () =>
      api<{ pedidos: PedidoListItem[]; total: number; page: number; pageSize: number }>(
        `/pedidos?${qs}`,
      ),
    placeholderData: (prev) => prev,
  });
}

// ───── Detalle del pedido ─────

export interface PedidoDetalleItemModificador {
  id: string;
  precioExtra: string;
  modificadorOpcion: { id: string; nombre: string; precioExtra: string };
  comboGrupo: { id: string; nombre: string } | null;
}

export interface PedidoDetalleItemComboOpcion {
  id: string;
  estado: EstadoPedido;
  precioExtra: string;
  comboGrupo: { id: string; nombre: string };
  comboGrupoOpcion: {
    productoVenta: { id: string; nombre: string };
  };
}

export interface PedidoDetalleItem {
  id: string;
  cantidad: number;
  precioUnitario: string;
  precioModificadores: string;
  subtotal: string;
  observaciones: string | null;
  estado: EstadoPedido;
  productoVenta: {
    id: string;
    nombre: string;
    codigo: string | null;
    sectorComanda: string | null;
  };
  modificadores: PedidoDetalleItemModificador[];
  combosOpcion: PedidoDetalleItemComboOpcion[];
}

export interface PedidoDetalle {
  id: string;
  numero: number;
  tipo: TipoPedido;
  estado: EstadoPedido;
  total: string;
  subtotal: string;
  totalIva: string;
  numeroPager: number | null;
  observaciones: string | null;
  createdAt: string;
  confirmadoEn: string | null;
  enPreparacionEn: string | null;
  listoEn: string | null;
  entregadoEn: string | null;
  facturadoEn: string | null;
  canceladoEn: string | null;
  cliente: { id: string; razonSocial: string; ruc: string | null; dv: string | null } | null;
  mesa: { id: string; numero: number } | null;
  tomadoPor: { id: string; nombreCompleto: string } | null;
  items: PedidoDetalleItem[];
}

export function usePedidoDetalle(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'pedido', id],
    queryFn: () => api<{ pedido: PedidoDetalle }>(`/pedidos/${id ?? ''}`),
    enabled: Boolean(id),
    select: (d) => d.pedido,
  });
}
