import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface CompraResumen {
  id: string;
  numero: number;
  fecha: string;
  numeroFactura: string | null;
  total: string;
  notas: string | null;
  proveedor: { id: string; razonSocial: string };
  sucursal: { id: string; codigo: string; nombre: string };
  _count: { items: number };
}

export interface ItemCompra {
  id: string;
  productoInventarioId: string;
  cantidad: string;
  costoUnitario: string;
  subtotal: string;
  producto: {
    id: string;
    codigo: string | null;
    nombre: string;
    unidadMedida: string;
  };
}

export interface CompraDetalle {
  id: string;
  numero: number;
  fecha: string;
  numeroFactura: string | null;
  total: string;
  notas: string | null;
  proveedor: {
    id: string;
    razonSocial: string;
    ruc: string | null;
    dv: string | null;
    contacto: string | null;
    telefono: string | null;
  };
  sucursal: { id: string; codigo: string; nombre: string; establecimiento: string };
  items: ItemCompra[];
  createdAt: string;
}

export interface CrearCompraInput {
  proveedorId: string;
  sucursalId: string;
  fecha?: string;
  numeroFactura?: string;
  notas?: string;
  items: Array<{
    productoInventarioId: string;
    cantidad: number;
    costoUnitario: number;
  }>;
}

export interface ListarComprasFiltros {
  proveedorId?: string;
  sucursalId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  numeroFactura?: string;
}

export function useCompras(filtros: ListarComprasFiltros = {}) {
  const params = new URLSearchParams();
  if (filtros.proveedorId) params.set('proveedorId', filtros.proveedorId);
  if (filtros.sucursalId) params.set('sucursalId', filtros.sucursalId);
  if (filtros.fechaDesde) params.set('fechaDesde', filtros.fechaDesde);
  if (filtros.fechaHasta) params.set('fechaHasta', filtros.fechaHasta);
  if (filtros.numeroFactura) params.set('numeroFactura', filtros.numeroFactura);
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery({
    queryKey: ['admin', 'compras', filtros],
    queryFn: () => api<{ compras: CompraResumen[]; nextCursor: string | null }>(`/compras${qs}`),
    select: (d) => d.compras,
  });
}

export function useCompra(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'compra', id],
    queryFn: () => api<{ compra: CompraDetalle }>(`/compras/${id ?? ''}`),
    enabled: Boolean(id),
    select: (d) => d.compra,
  });
}

export function useCrearCompra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearCompraInput) =>
      api<{ compra: CompraDetalle }>('/compras', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'compras'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'insumos'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'inventario'] });
    },
  });
}

export function useEliminarCompra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/compras/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'compras'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'compra'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'insumos'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'inventario'] });
    },
  });
}
