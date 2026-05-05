'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
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

export function useKdsPedidos(sector?: Sector | null) {
  // Pasamos `sector` al backend para que filtre allá y no traiga pedidos
  // que la tab actual no necesita (hay un solo lookup; sin esto el KDS
  // pega 1 fetch por tab cambio igual, pero trae todo el catálogo).
  const qs = sector ? `?sector=${sector}` : '';
  return useQuery({
    queryKey: ['kds', 'pedidos', sector ?? 'TODOS'],
    queryFn: () => api<{ pedidos: KdsPedido[] }>(`/pedidos/kds${qs}`),
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    // Mismo origen vía Next rewrite (configurado en next.config.mjs)
    const socket: Socket = io({
      path: '/socket.io',
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });

    // Debounce: en sucursales con muchos pedidos llegan ráfagas de eventos
    // (ej: cocina marca varios items en 1 segundo). Sin esto refetcheamos por
    // cada uno; con 250ms colapsamos la ráfaga en una sola query.
    const refetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['kds', 'pedidos'] });
        debounceRef.current = null;
      }, 250);
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
    // Cuando otro KDS marca lista una opción de combo, queremos enterarnos
    // (un combo cocinado por cocina+bar: si bar termina su parte primero,
    // cocina necesita refetchear para ver la opción ya en LISTO).
    socket.on('pedido.combo-opcion.estado', refetch);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [accessToken, qc, onPedidoNuevo]);
}
