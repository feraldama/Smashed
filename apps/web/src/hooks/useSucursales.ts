import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface Sucursal {
  id: string;
  empresaId: string;
  nombre: string;
  codigo: string;
  establecimiento: string;
  direccion: string;
  ciudad: string | null;
  departamento: string | null;
  telefono: string | null;
  email: string | null;
  zonaHoraria: string | null;
  activa: boolean;
  createdAt: string;
  updatedAt: string;
  _count: {
    cajas: number;
    puntosExpedicion: number;
  };
}

export interface CrearSucursalInput {
  nombre: string;
  codigo: string;
  establecimiento: string;
  direccion: string;
  ciudad?: string;
  departamento?: string;
  telefono?: string;
  email?: string;
  zonaHoraria?: string;
}

export interface ActualizarSucursalInput {
  nombre?: string;
  codigo?: string;
  establecimiento?: string;
  direccion?: string;
  ciudad?: string | null;
  departamento?: string | null;
  telefono?: string | null;
  email?: string | null;
  zonaHoraria?: string | null;
  activa?: boolean;
}

export function useSucursales() {
  return useQuery({
    queryKey: ['admin', 'sucursales'],
    queryFn: () => api<{ sucursales: Sucursal[] }>('/sucursales'),
    select: (d) => d.sucursales,
  });
}

export function useCrearSucursal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearSucursalInput) =>
      api<{ sucursal: Sucursal }>('/sucursales', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sucursales'] }),
  });
}

export function useActualizarSucursal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & ActualizarSucursalInput) =>
      api<{ sucursal: Sucursal }>(`/sucursales/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sucursales'] }),
  });
}

export interface PuntoExpedicion {
  id: string;
  codigo: string;
  descripcion: string | null;
}

export function usePuntosExpedicion(sucursalId: string | null) {
  return useQuery({
    queryKey: ['admin', 'puntos-expedicion', sucursalId],
    queryFn: () =>
      api<{ puntos: PuntoExpedicion[] }>(`/sucursales/${sucursalId ?? ''}/puntos-expedicion`),
    select: (d) => d.puntos,
    enabled: Boolean(sucursalId),
  });
}

export function useEliminarSucursal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/sucursales/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'sucursales'] }),
  });
}
