import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export type EstadoTransferencia =
  | 'PENDIENTE'
  | 'APROBADA'
  | 'EN_TRANSITO'
  | 'RECIBIDA'
  | 'RECHAZADA'
  | 'CANCELADA';

export interface TransferenciaResumen {
  id: string;
  numero: number;
  estado: EstadoTransferencia;
  fechaSolicitud: string;
  fechaRecepcion: string | null;
  notas: string | null;
  sucursalOrigen: { id: string; codigo: string; nombre: string };
  sucursalDestino: { id: string; codigo: string; nombre: string };
  _count: { items: number };
}

export interface ItemTransferencia {
  id: string;
  productoInventarioId: string;
  cantidadSolicitada: string;
  cantidadEnviada: string | null;
  cantidadRecibida: string | null;
  notas: string | null;
  producto: { id: string; codigo: string | null; nombre: string; unidadMedida: string };
}

export interface TransferenciaDetalle {
  id: string;
  numero: number;
  estado: EstadoTransferencia;
  fechaSolicitud: string;
  fechaAprobacion: string | null;
  fechaRecepcion: string | null;
  notas: string | null;
  solicitadoPor: string;
  aprobadoPor: string | null;
  recibidoPor: string | null;
  solicitadoPorNombre: string | null;
  aprobadoPorNombre: string | null;
  recibidoPorNombre: string | null;
  sucursalOrigen: { id: string; codigo: string; nombre: string };
  sucursalDestino: { id: string; codigo: string; nombre: string };
  items: ItemTransferencia[];
  createdAt: string;
}

export interface CrearTransferenciaInput {
  sucursalOrigenId: string;
  sucursalDestinoId: string;
  notas?: string;
  items: Array<{ productoInventarioId: string; cantidad: number }>;
}

export interface ListarTransferenciasFiltros {
  sucursalOrigenId?: string;
  sucursalDestinoId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

export function useTransferencias(filtros: ListarTransferenciasFiltros = {}) {
  const params = new URLSearchParams();
  if (filtros.sucursalOrigenId) params.set('sucursalOrigenId', filtros.sucursalOrigenId);
  if (filtros.sucursalDestinoId) params.set('sucursalDestinoId', filtros.sucursalDestinoId);
  if (filtros.fechaDesde) params.set('fechaDesde', filtros.fechaDesde);
  if (filtros.fechaHasta) params.set('fechaHasta', filtros.fechaHasta);
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery({
    queryKey: ['admin', 'transferencias', filtros],
    queryFn: () =>
      api<{ transferencias: TransferenciaResumen[]; nextCursor: string | null }>(
        `/transferencias${qs}`,
      ),
    select: (d) => d.transferencias,
  });
}

export function useTransferencia(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'transferencia', id],
    queryFn: () => api<{ transferencia: TransferenciaDetalle }>(`/transferencias/${id ?? ''}`),
    enabled: Boolean(id),
    select: (d) => d.transferencia,
  });
}

export function useCrearTransferencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearTransferenciaInput) =>
      api<{ transferencia: TransferenciaDetalle }>('/transferencias', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'transferencias'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'insumos'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'inventario'] });
    },
  });
}
