import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { EstadoPedido, TipoPedido } from './usePedidos';

import { api } from '@/lib/api';


export type EstadoItem = EstadoPedido;

export interface KdsItemModificador {
  id: string;
  modificadorOpcion: { nombre: string };
}

export interface KdsItemCombo {
  id: string;
  comboGrupo: { nombre: string };
  comboGrupoOpcion: { productoVenta: { nombre: string } };
}

export interface KdsItem {
  id: string;
  cantidad: number;
  estado: EstadoItem;
  observaciones: string | null;
  productoVenta: {
    id: string;
    nombre: string;
    sectorComanda: string | null;
    tiempoPrepSegundos: number | null;
  };
  modificadores: KdsItemModificador[];
  combosOpcion: KdsItemCombo[];
}

export interface KdsPedido {
  id: string;
  numero: number;
  tipo: TipoPedido;
  estado: EstadoPedido;
  observaciones: string | null;
  confirmadoEn: string | null;
  enPreparacionEn: string | null;
  mesa: { id: string; numero: number } | null;
  cliente: { id: string; razonSocial: string } | null;
  items: KdsItem[];
}

/**
 * Listado de pedidos activos para KDS.
 * Incluye CONFIRMADO + EN_PREPARACION; ordenados por confirmadoEn ASC.
 * Items LISTO/CANCELADO se filtran del lado del backend.
 *
 * Polling cada 5s — Fase 2.5 lo va a reemplazar por socket.io.
 */
export function useKds() {
  return useQuery({
    queryKey: ['kds', 'pedidos'],
    queryFn: () => api<{ pedidos: KdsPedido[] }>('/pedidos/kds'),
    select: (d) => d.pedidos,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });
}

export function useTransicionarItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      pedidoId,
      itemId,
      estado,
    }: {
      pedidoId: string;
      itemId: string;
      estado: 'EN_PREPARACION' | 'LISTO';
    }) =>
      api<{ ok: true }>(`/pedidos/${pedidoId}/items/${itemId}/estado`, {
        method: 'PATCH',
        body: { estado },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kds', 'pedidos'] });
    },
  });
}

export function useTransicionarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pedidoId, estado }: { pedidoId: string; estado: EstadoPedido }) =>
      api<{ pedido: { id: string; estado: EstadoPedido } }>(`/pedidos/${pedidoId}/estado`, {
        method: 'PATCH',
        body: { estado },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kds', 'pedidos'] });
    },
  });
}
