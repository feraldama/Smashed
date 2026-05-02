'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';

import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

export type Sector =
  | 'COCINA_CALIENTE'
  | 'COCINA_FRIA'
  | 'PARRILLA'
  | 'BAR'
  | 'CAFETERIA'
  | 'POSTRES';

export interface KdsItem {
  id: string;
  cantidad: number;
  estado: string;
  observaciones: string | null;
  sectorComanda: Sector | null;
  productoVenta: {
    id: string;
    nombre: string;
    sectorComanda: Sector | null;
    tiempoPrepSegundos: number | null;
  };
  modificadores: Array<{ modificadorOpcion: { nombre: string } }>;
  combosOpcion: Array<{
    comboGrupo: { nombre: string };
    comboGrupoOpcion: { productoVenta: { nombre: string } };
  }>;
}

export interface KdsPedido {
  id: string;
  numero: number;
  tipo: string;
  estado: string;
  observaciones: string | null;
  confirmadoEn: string | null;
  mesa: { id: string; numero: number } | null;
  cliente: { id: string; razonSocial: string } | null;
  items: KdsItem[];
}

export function useKdsPedidos() {
  return useQuery({
    queryKey: ['kds', 'pedidos'],
    queryFn: () => api<{ pedidos: KdsPedido[] }>('/pedidos/kds'),
    select: (d) => d.pedidos,
    staleTime: 2_000,
  });
}

export function useCambiarEstadoItem() {
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
      api<unknown>(`/pedidos/${pedidoId}/items/${itemId}/estado`, {
        method: 'PATCH',
        body: { estado },
      }),
    onSuccess: () => {
      // Optimistic refetch — el socket también lo va a empujar pero por las dudas.
      void qc.invalidateQueries({ queryKey: ['kds'] });
    },
  });
}

/**
 * Conecta a Socket.io y suscribe a los eventos del KDS.
 * Re-fetchea la lista cuando cambia algo.
 *
 * Devuelve helpers para alertar al usuario (sonido al llegar pedido nuevo).
 */
export function useKdsSocket(onPedidoNuevo?: () => void) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();

  useEffect(() => {
    if (!accessToken) return;

    // Mismo origen vía Next rewrite (configurado en next.config.mjs)
    const socket: Socket = io({
      path: '/socket.io',
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });

    const refetch = () => {
      void qc.invalidateQueries({ queryKey: ['kds', 'pedidos'] });
    };

    socket.on('connect_error', (err) => {
       
      console.warn('[ws] connect_error:', err.message);
    });

    socket.on('pedido.confirmado', () => {
      refetch();
      onPedidoNuevo?.();
    });

    socket.on('pedido.actualizado', refetch);
    socket.on('pedido.cancelado', refetch);
    socket.on('pedido.item.estado', refetch);

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [accessToken, qc, onPedidoNuevo]);
}
