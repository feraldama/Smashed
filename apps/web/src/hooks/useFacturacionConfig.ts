import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export type AmbienteFacturacion = 'TEST' | 'PROD';

export interface AmbienteConfig {
  dominio: string | null;
  ruc: string | null;
  tienePassword: boolean;
}

export interface FacturacionConfig {
  configurado: boolean;
  proveedor?: 'CODE100';
  ambienteActivo?: AmbienteFacturacion;
  emisorTipoContribuyente?: number;
  activo?: boolean;
  test?: AmbienteConfig;
  prod?: AmbienteConfig;
  updatedAt?: string;
}

export interface CredencialesAmbienteInput {
  dominio: string;
  ruc: string;
  /** Sólo se envía si el admin lo cargó/cambió. */
  password?: string;
}

export interface GuardarFacturacionInput {
  ambienteActivo?: AmbienteFacturacion;
  emisorTipoContribuyente?: 1 | 2;
  activo?: boolean;
  test?: CredencialesAmbienteInput;
  prod?: CredencialesAmbienteInput;
}

const KEY = ['admin', 'facturacion-config'];

export function useFacturacionConfig() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<FacturacionConfig>('/facturacion/config'),
  });
}

export function useGuardarFacturacionConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GuardarFacturacionInput) =>
      api<unknown>('/facturacion/config', { method: 'PUT', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
