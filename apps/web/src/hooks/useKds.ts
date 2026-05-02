import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { EstadoPedido, TipoPedido } from './usePedidos';

import { api } from '@/lib/api';

export type EstadoItem = EstadoPedido;
export type SectorComanda =
  | 'COCINA_CALIENTE'
  | 'COCINA_FRIA'
  | 'PARRILLA'
  | 'BAR'
  | 'CAFETERIA'
  | 'POSTRES';

export interface KdsItemModificador {
  id: string;
  modificadorOpcion: { nombre: string };
}

export interface KdsItemCombo {
  id: string;
  estado: EstadoItem;
  sectorComanda: SectorComanda | null;
  comboGrupo: { nombre: string };
  comboGrupoOpcion: {
    productoVenta: { nombre: string; sectorComanda: SectorComanda | null };
  };
}

export interface KdsItem {
  id: string;
  cantidad: number;
  estado: EstadoItem;
  observaciones: string | null;
  productoVenta: {
    id: string;
    nombre: string;
    sectorComanda: SectorComanda | null;
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
 * Listado de pedidos activos para KDS, opcionalmente filtrado por sector.
 *
 * Sin sector → vista mostrador: pedido completo, todos los items y opciones,
 * para verificar que está todo listo antes de entregar al cliente.
 *
 * Con sector → vista por estación (cocina caliente, bar, parrilla...): sólo
 * pedidos con sub-tareas de ese sector aún pendientes. Cocina ve cocina, bar
 * ve bar — cada uno marca lo suyo sin pisarse.
 *
 * Polling cada 5s — Fase 2.5 lo va a reemplazar por socket.io.
 */
export function useKds(sector?: SectorComanda | null) {
  const qs = sector ? `?sector=${sector}` : '';
  return useQuery({
    queryKey: ['kds', 'pedidos', sector ?? 'mostrador'],
    queryFn: () => api<{ pedidos: KdsPedido[] }>(`/pedidos/kds${qs}`),
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

export function useTransicionarComboOpcion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      pedidoId,
      comboOpcionId,
      estado,
    }: {
      pedidoId: string;
      comboOpcionId: string;
      estado: 'EN_PREPARACION' | 'LISTO';
    }) =>
      api<{ ok: true }>(`/pedidos/${pedidoId}/combo-opciones/${comboOpcionId}/estado`, {
        method: 'PATCH',
        body: { estado },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kds', 'pedidos'] });
    },
  });
}

/** Mostrador cierra el pedido cuando ya se lo dio al cliente. */
export function useEntregarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pedidoId: string) =>
      api<{ pedido: { id: string } }>(`/pedidos/${pedidoId}/entregar`, { method: 'POST' }),
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
