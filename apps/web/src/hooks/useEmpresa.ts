import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface Empresa {
  id: string;
  nombreFantasia: string;
  razonSocial: string;
  ruc: string;
  dv: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  logoUrl: string | null;
  colorPrimario: string | null;
  colorSecundario: string | null;
  zonaHoraria: string;
  activa: boolean;
  createdAt: string;
  updatedAt: string;
  configuracion: {
    permitirStockNegativo: boolean;
    redondearTotales: boolean;
    ivaIncluidoEnPrecio: boolean;
    emitirTicketPorDefecto: boolean;
  };
  _count: {
    sucursales: number;
    usuarios: number;
  };
}

export interface ActualizarEmpresaInput {
  nombreFantasia?: string;
  razonSocial?: string;
  ruc?: string;
  dv?: string;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  colorSecundario?: string | null;
  zonaHoraria?: string;
}

export interface ActualizarConfiguracionInput {
  permitirStockNegativo?: boolean;
  redondearTotales?: boolean;
  ivaIncluidoEnPrecio?: boolean;
  emitirTicketPorDefecto?: boolean;
}

export function useEmpresa() {
  return useQuery({
    queryKey: ['admin', 'empresa'],
    queryFn: () => api<{ empresa: Empresa }>('/empresa/mi-empresa'),
    select: (d) => d.empresa,
  });
}

export function useActualizarEmpresa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ActualizarEmpresaInput) =>
      api<{ empresa: Empresa }>('/empresa/mi-empresa', { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'empresa'] }),
  });
}

export function useActualizarConfiguracion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ActualizarConfiguracionInput) =>
      api<{ empresa: Empresa }>('/empresa/mi-empresa/configuracion', {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'empresa'] }),
  });
}
