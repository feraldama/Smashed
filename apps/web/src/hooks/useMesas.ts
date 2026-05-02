import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export type EstadoMesa = 'LIBRE' | 'OCUPADA' | 'RESERVADA' | 'LIMPIEZA';

export interface Mesa {
  id: string;
  numero: number;
  capacidad: number;
  estado: EstadoMesa;
  pedidoActivo: { id: string; numero: number } | null;
}

export interface ZonaMesa {
  id: string;
  nombre: string;
  orden: number;
  mesas: Mesa[];
}

export function useZonasMesas() {
  return useQuery({
    queryKey: ['admin', 'mesas'],
    queryFn: () => api<{ zonas: ZonaMesa[] }>('/mesas'),
    select: (d) => d.zonas,
    refetchInterval: 15_000, // refresh para que el cajero vea liberaciones
  });
}
