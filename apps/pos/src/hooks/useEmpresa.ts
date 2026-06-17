import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface EmpresaConfig {
  permitirStockNegativo: boolean;
  redondearTotales: boolean;
  ivaIncluidoEnPrecio: boolean;
  emitirTicketPorDefecto: boolean;
  porcentajeDescuentoEmpleado: number;
}

export interface Empresa {
  id: string;
  nombreFantasia: string;
  razonSocial: string;
  ruc: string;
  dv: string;
  configuracion: EmpresaConfig;
}

/**
 * Config de la empresa del usuario. `GET /empresa/mi-empresa` es accesible por
 * cualquier rol autenticado (cajero incluido), así que sirve para leer flags
 * operativos como `emitirTicketPorDefecto` desde el POS.
 */
export function useEmpresa() {
  return useQuery({
    queryKey: ['empresa', 'mi-empresa'],
    queryFn: () => api<{ empresa: Empresa }>('/empresa/mi-empresa'),
    select: (d) => d.empresa,
  });
}
