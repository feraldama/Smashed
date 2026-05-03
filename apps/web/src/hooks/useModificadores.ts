import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export type TipoModificadorGrupo = 'UNICA' | 'MULTIPLE';

export interface ModificadorOpcion {
  id: string;
  modificadorGrupoId: string;
  nombre: string;
  precioExtra: string; // BigInt serializado
  orden: number;
  activo: boolean;
}

export interface ModificadorGrupo {
  id: string;
  empresaId: string;
  nombre: string;
  tipo: TipoModificadorGrupo;
  obligatorio: boolean;
  minSeleccion: number;
  maxSeleccion: number | null;
  opciones: ModificadorOpcion[];
  _count?: { productosVentaAplicados: number };
}

export interface ProductoVinculado {
  productoVentaId: string;
  modificadorGrupoId: string;
  ordenEnProducto: number;
  productoVenta: { id: string; codigo: string; nombre: string };
}

export interface ModificadorGrupoDetalle extends ModificadorGrupo {
  productosVentaAplicados: ProductoVinculado[];
}

// ───── Query ─────

export function useModificadores(busqueda?: string) {
  return useQuery({
    queryKey: ['admin', 'modificadores', busqueda ?? ''],
    queryFn: () =>
      api<{ grupos: ModificadorGrupo[] }>(
        `/modificadores${busqueda ? `?busqueda=${encodeURIComponent(busqueda)}` : ''}`,
      ),
    select: (d) => d.grupos,
  });
}

export function useModificador(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'modificadores', 'detalle', id],
    queryFn: () => api<{ grupo: ModificadorGrupoDetalle }>(`/modificadores/${id ?? ''}`),
    select: (d) => d.grupo,
    enabled: Boolean(id),
  });
}

// ───── Grupos ─────

export interface OpcionInput {
  nombre: string;
  precioExtra?: number;
  orden?: number;
  activo?: boolean;
}

export interface CrearGrupoInput {
  nombre: string;
  tipo?: TipoModificadorGrupo;
  obligatorio?: boolean;
  minSeleccion?: number;
  maxSeleccion?: number | null;
  opciones?: OpcionInput[];
}

export interface ActualizarGrupoInput {
  nombre?: string;
  tipo?: TipoModificadorGrupo;
  obligatorio?: boolean;
  minSeleccion?: number;
  maxSeleccion?: number | null;
}

export function useCrearGrupo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearGrupoInput) =>
      api<{ grupo: ModificadorGrupo }>('/modificadores', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'modificadores'] }),
  });
}

export function useActualizarGrupo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & ActualizarGrupoInput) =>
      api<{ grupo: ModificadorGrupo }>(`/modificadores/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'modificadores'] }),
  });
}

export function useEliminarGrupo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<undefined>(`/modificadores/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'modificadores'] }),
  });
}

// ───── Opciones ─────

export function useCrearOpcion(grupoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OpcionInput) =>
      api<{ opcion: ModificadorOpcion }>(`/modificadores/${grupoId}/opciones`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'modificadores'] }),
  });
}

export function useActualizarOpcion(grupoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ opcionId, ...input }: { opcionId: string } & OpcionInput) =>
      api<{ opcion: ModificadorOpcion }>(`/modificadores/${grupoId}/opciones/${opcionId}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'modificadores'] }),
  });
}

export function useEliminarOpcion(grupoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opcionId: string) =>
      api<undefined>(`/modificadores/${grupoId}/opciones/${opcionId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'modificadores'] }),
  });
}

// ───── Vinculación Producto ↔ Grupo ─────

export function useVincularModificadorAProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      grupoId,
      productoVentaId,
      ordenEnProducto,
    }: {
      grupoId: string;
      productoVentaId: string;
      ordenEnProducto?: number;
    }) =>
      api<{
        link: { productoVentaId: string; modificadorGrupoId: string; ordenEnProducto: number };
      }>(`/modificadores/${grupoId}/productos`, {
        method: 'POST',
        body: { productoVentaId, ordenEnProducto },
      }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'modificadores'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'producto', vars.productoVentaId] });
    },
  });
}

export function useDesvincularModificadorDeProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ grupoId, productoVentaId }: { grupoId: string; productoVentaId: string }) =>
      api<undefined>(`/modificadores/${grupoId}/productos/${productoVentaId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'modificadores'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'producto', vars.productoVentaId] });
    },
  });
}
