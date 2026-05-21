import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export type TipoPromocion = 'PRECIO_FIJO' | 'PORCENTAJE' | 'NXM' | 'COMBO';

export interface PromocionProducto {
  promocionId: string;
  productoVentaId: string;
  cantidadMin: number;
  productoVenta: {
    id: string;
    nombre: string;
    codigo: string | null;
    precioBase: string;
    imagenUrl: string | null;
  };
}

export interface Promocion {
  id: string;
  empresaId: string;
  nombre: string;
  descripcion: string | null;
  tipo: TipoPromocion;
  precioFijo: string | null;
  porcentaje: number | null;
  nxmLleva: number | null;
  nxmPaga: number | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  diasSemana: number[];
  horaInicio: string | null;
  horaFin: string | null;
  activo: boolean;
  iconoEmoji: string | null;
  ordenMenu: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  productos: PromocionProducto[];
  sucursales: Array<{ sucursalId: string }>;
}

export interface PromocionInput {
  nombre: string;
  descripcion?: string | null;
  tipo: TipoPromocion;
  precioFijo?: number | null;
  porcentaje?: number | null;
  nxmLleva?: number | null;
  nxmPaga?: number | null;
  vigenciaDesde?: string | null;
  vigenciaHasta?: string | null;
  diasSemana: number[];
  horaInicio?: string | null;
  horaFin?: string | null;
  activo: boolean;
  iconoEmoji?: string | null;
  ordenMenu: number;
  productos: Array<{ productoVentaId: string; cantidadMin: number }>;
  sucursalIds: string[];
}

export type FiltroPromociones = 'TODAS' | 'ACTIVAS' | 'INACTIVAS';

export function usePromociones(filtro: FiltroPromociones = 'TODAS', q?: string) {
  const params = new URLSearchParams({ filtro });
  if (q) params.set('q', q);
  return useQuery({
    queryKey: ['promociones', filtro, q ?? ''],
    queryFn: () => api<{ promociones: Promocion[] }>(`/promociones?${params.toString()}`),
    select: (d) => d.promociones,
  });
}

export function usePromocion(id: string | null | undefined) {
  return useQuery({
    queryKey: ['promocion', id],
    queryFn: () => api<{ promocion: Promocion }>(`/promociones/${id ?? ''}`),
    select: (d) => d.promocion,
    enabled: Boolean(id),
  });
}

export function useCrearPromocion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PromocionInput) =>
      api<{ promocion: Promocion }>('/promociones', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promociones'] }),
  });
}

export function useActualizarPromocion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<PromocionInput>) =>
      api<{ promocion: Promocion }>(`/promociones/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['promociones'] });
      void qc.invalidateQueries({ queryKey: ['promocion', vars.id] });
    },
  });
}

export function useEliminarPromocion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/promociones/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promociones'] }),
  });
}

// /vigentes — lectura para el POS (Fase 2). Lo dejamos exportado para uso futuro.
export function usePromocionesVigentes(sucursalId: string | null | undefined) {
  return useQuery({
    queryKey: ['promociones', 'vigentes', sucursalId],
    queryFn: () =>
      api<{ promociones: Promocion[] }>(
        `/promociones/vigentes?sucursalId=${encodeURIComponent(sucursalId ?? '')}`,
      ),
    select: (d) => d.promociones,
    enabled: Boolean(sucursalId),
    // Refetch cada 60s porque el filtro de vigencia depende del momento actual.
    refetchInterval: 60_000,
  });
}
