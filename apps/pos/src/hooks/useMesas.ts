import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export type EstadoMesa =
  | 'LIBRE'
  | 'OCUPADA'
  | 'RESERVADA'
  | 'PRECUENTA'
  | 'LIMPIEZA'
  | 'FUERA_DE_SERVICIO';

export interface Mesa {
  id: string;
  numero: number;
  capacidad: number;
  estado: EstadoMesa;
  pedidoActivo: {
    id: string;
    numero: number;
    estado: string;
    total: string;
    tomadoEn: string | null;
    tomadoPor: { id: string; nombreCompleto: string } | null;
  } | null;
}

export interface ZonaMesa {
  id: string;
  nombre: string;
  orden: number;
  mesas: Mesa[];
}

export function useMesas() {
  return useQuery({
    queryKey: ['mesas'],
    queryFn: () => api<{ zonas: ZonaMesa[] }>('/mesas'),
    select: (d) => d.zonas,
    staleTime: 10_000,
  });
}

export function useCambiarEstadoMesa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoMesa }) =>
      api<{ mesa: Mesa }>(`/mesas/${id}/estado`, { method: 'PATCH', body: { estado } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mesas'] }),
  });
}
