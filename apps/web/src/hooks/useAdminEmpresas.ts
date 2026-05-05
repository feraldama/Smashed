import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface AdminEmpresa {
  id: string;
  nombreFantasia: string;
  razonSocial: string;
  ruc: string;
  dv: string;
  email: string | null;
  telefono: string | null;
  activa: boolean;
  motivoInactiva: string | null;
  fechaInactivacion: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    sucursales: number;
    usuarios: number;
  };
}

interface ListadoEmpresas {
  items: AdminEmpresa[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CrearEmpresaInput {
  nombreFantasia: string;
  razonSocial: string;
  ruc: string;
  dv: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  zonaHoraria?: string;
  colorPrimario?: string;
  colorSecundario?: string;
  admin: {
    email: string;
    nombreCompleto: string;
    password?: string;
  };
  sucursalInicial?: {
    nombre: string;
    codigo: string;
    establecimiento: string;
    direccion: string;
    ciudad?: string;
    departamento?: string;
    telefono?: string;
    email?: string;
  };
}

export interface CrearEmpresaResultado {
  empresa: AdminEmpresa;
  admin: {
    id: string;
    email: string;
    nombreCompleto: string;
    rol: string;
  };
  sucursal: { id: string; nombre: string; codigo: string } | null;
  passwordInicial: string | null;
}

export interface ListarEmpresasFilter {
  q?: string;
  activa?: boolean;
  page?: number;
  pageSize?: number;
}

const KEY = ['admin', 'empresas'] as const;

export function useAdminEmpresas(filter: ListarEmpresasFilter = {}) {
  const params = new URLSearchParams();
  if (filter.q) params.set('q', filter.q);
  if (filter.activa !== undefined) params.set('activa', String(filter.activa));
  if (filter.page) params.set('page', String(filter.page));
  if (filter.pageSize) params.set('pageSize', String(filter.pageSize));
  const qs = params.toString();

  return useQuery({
    queryKey: [...KEY, filter],
    queryFn: () => api<ListadoEmpresas>(`/admin/empresas${qs ? `?${qs}` : ''}`),
  });
}

export function useCrearAdminEmpresa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearEmpresaInput) =>
      api<CrearEmpresaResultado>('/admin/empresas', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCambiarActivaEmpresa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activa, motivo }: { id: string; activa: boolean; motivo?: string }) =>
      api<{ empresa: AdminEmpresa }>(`/admin/empresas/${id}/activa`, {
        method: 'PATCH',
        body: { activa, motivo },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface OperarComoResultado {
  accessToken: string;
  sucursalActivaId: string | null;
  empresa: { id: string; nombreFantasia: string; razonSocial: string };
}

export function useOperarComoEmpresa() {
  return useMutation({
    mutationFn: (id: string) =>
      api<OperarComoResultado>(`/admin/empresas/${id}/operar`, { method: 'POST' }),
  });
}

export function useSalirDeOperar() {
  return useMutation({
    mutationFn: () =>
      api<{ accessToken: string }>('/admin/empresas/salir-modo-operar', { method: 'POST' }),
  });
}
