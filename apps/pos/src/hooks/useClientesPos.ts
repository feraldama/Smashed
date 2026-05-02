import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface ClienteListado {
  id: string;
  tipoContribuyente: string;
  razonSocial: string;
  nombreFantasia: string | null;
  ruc: string | null;
  dv: string | null;
  documento: string | null;
  email: string | null;
  telefono: string | null;
  esConsumidorFinal: boolean;
}

export interface Direccion {
  id: string;
  alias: string | null;
  direccion: string;
  ciudad: string | null;
  esPrincipal: boolean;
}

export interface ClienteDetalle extends ClienteListado {
  direcciones: Direccion[];
}

export function useClientesPos(busqueda?: string) {
  const params = busqueda ? `?busqueda=${encodeURIComponent(busqueda)}` : '';
  return useQuery({
    queryKey: ['pos', 'clientes', busqueda],
    queryFn: () => api<{ clientes: ClienteListado[] }>(`/clientes${params}`),
    select: (d) => d.clientes,
    enabled: Boolean(busqueda && busqueda.length >= 2),
  });
}

export function useClienteDetalle(id: string | null) {
  return useQuery({
    queryKey: ['pos', 'cliente', id],
    queryFn: () => api<{ cliente: ClienteDetalle }>(`/clientes/${id!}`),
    enabled: Boolean(id),
    select: (d) => d.cliente,
  });
}

interface CrearClienteInput {
  tipoContribuyente: 'PERSONA_FISICA' | 'PERSONA_JURIDICA' | 'EXTRANJERO';
  razonSocial: string;
  documento?: string;
  ruc?: string;
  dv?: string;
  telefono?: string;
}

export function useCrearClientePos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearClienteInput) =>
      api<{ cliente: ClienteListado }>('/clientes', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos', 'clientes'] }),
  });
}

interface AgregarDireccionInput {
  clienteId: string;
  alias?: string;
  direccion: string;
  ciudad?: string;
  esPrincipal: boolean;
}

export function useAgregarDireccionPos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clienteId, ...input }: AgregarDireccionInput) =>
      api<{ direccion: Direccion }>(`/clientes/${clienteId}/direcciones`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['pos', 'cliente', vars.clienteId] }),
  });
}
