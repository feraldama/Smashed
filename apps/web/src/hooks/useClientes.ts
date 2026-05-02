import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface Cliente {
  id: string;
  tipoContribuyente: 'PERSONA_FISICA' | 'PERSONA_JURIDICA' | 'EXTRANJERO' | 'CONSUMIDOR_FINAL';
  razonSocial: string;
  nombreFantasia: string | null;
  ruc: string | null;
  dv: string | null;
  documento: string | null;
  email: string | null;
  telefono: string | null;
  esConsumidorFinal: boolean;
  createdAt: string;
}

export interface Direccion {
  id: string;
  alias: string | null;
  direccion: string;
  ciudad: string | null;
  departamento: string | null;
  referencias: string | null;
  esPrincipal: boolean;
}

export interface ClienteDetalle extends Cliente {
  direcciones: Direccion[];
}

export function useClientes(busqueda?: string) {
  const params = busqueda ? `?busqueda=${encodeURIComponent(busqueda)}` : '';
  return useQuery({
    queryKey: ['admin', 'clientes', busqueda],
    queryFn: () => api<{ clientes: Cliente[] }>(`/clientes${params}`),
    select: (d) => d.clientes,
  });
}

export function useCliente(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'cliente', id],
    queryFn: () => api<{ cliente: ClienteDetalle }>(`/clientes/${id ?? ''}`),
    enabled: Boolean(id),
    select: (d) => d.cliente,
  });
}

interface ClienteInput {
  tipoContribuyente: Cliente['tipoContribuyente'];
  razonSocial: string;
  nombreFantasia?: string;
  ruc?: string;
  dv?: string;
  documento?: string;
  email?: string;
  telefono?: string;
}

export function useCrearCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClienteInput) =>
      api<{ cliente: Cliente }>('/clientes', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'clientes'] }),
  });
}

export function useActualizarCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<ClienteInput>) =>
      api<{ cliente: Cliente }>(`/clientes/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'clientes'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'cliente', vars.id] });
    },
  });
}

export function useEliminarCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/clientes/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'clientes'] }),
  });
}

interface DireccionInput {
  alias?: string;
  direccion: string;
  ciudad?: string;
  departamento?: string;
  referencias?: string;
  esPrincipal: boolean;
}

export function useAgregarDireccion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clienteId, ...input }: { clienteId: string } & DireccionInput) =>
      api<{ direccion: Direccion }>(`/clientes/${clienteId}/direcciones`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['admin', 'cliente', vars.clienteId] }),
  });
}

export function useEliminarDireccion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clienteId, dirId }: { clienteId: string; dirId: string }) =>
      api<void>(`/clientes/${clienteId}/direcciones/${dirId}`, { method: 'DELETE' }),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['admin', 'cliente', vars.clienteId] }),
  });
}
