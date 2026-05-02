import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  sucursalId: string;
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

// ───── Zonas ─────

export interface CrearZonaInput {
  sucursalId: string;
  nombre: string;
  orden?: number;
}
export interface ActualizarZonaInput {
  nombre?: string;
  orden?: number;
}

export function useCrearZona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearZonaInput) =>
      api<{ zona: ZonaMesa }>('/mesas/zonas', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'mesas'] }),
  });
}

export function useActualizarZona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & ActualizarZonaInput) =>
      api<{ zona: ZonaMesa }>(`/mesas/zonas/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'mesas'] }),
  });
}

export function useEliminarZona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<undefined>(`/mesas/zonas/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'mesas'] }),
  });
}

// ───── Mesas ─────

export interface CrearMesaInput {
  zonaMesaId: string;
  numero: number;
  capacidad?: number;
}
export interface ActualizarMesaInput {
  zonaMesaId?: string;
  numero?: number;
  capacidad?: number;
}

export function useCrearMesa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearMesaInput) =>
      api<{ mesa: Mesa }>('/mesas', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'mesas'] }),
  });
}

export function useActualizarMesa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & ActualizarMesaInput) =>
      api<{ mesa: Mesa }>(`/mesas/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'mesas'] }),
  });
}

export function useEliminarMesa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<undefined>(`/mesas/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'mesas'] }),
  });
}
