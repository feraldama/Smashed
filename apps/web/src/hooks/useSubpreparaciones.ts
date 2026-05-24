import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export type ModoStockReceta = 'CALCULADA' | 'LOTE';

export type UnidadMedida = 'UNIDAD' | 'GRAMO' | 'KILOGRAMO' | 'MILILITRO' | 'LITRO' | 'PORCION';

export interface StockEnSucursal {
  sucursalId: string;
  stockActual: string;
  stockMinimo: string;
  sucursal?: { id: string; nombre: string };
}

export interface ProductoInventarioEspejo {
  id: string;
  nombre: string;
  codigo: string | null;
  unidadMedida: UnidadMedida;
  stockSucursal: StockEnSucursal[];
}

export interface RecetaConModo {
  id: string;
  rinde: string;
  modoStock: ModoStockReceta;
  productoInventarioId: string | null;
  productoInventarioEspejo: ProductoInventarioEspejo | null;
  items: {
    id: string;
    cantidad: string;
    unidadMedida: UnidadMedida;
    esOpcional: boolean;
    insumo: { id: string; nombre: string; unidadMedida: UnidadMedida } | null;
    subProducto: { id: string; nombre: string } | null;
  }[];
}

export interface Subpreparacion {
  id: string;
  nombre: string;
  codigo: string | null;
  descripcion: string | null;
  esPreparacion: boolean;
  esVendible: boolean;
  activo: boolean;
  receta: RecetaConModo | null;
}

export function useSubpreparaciones(params: { sucursalId?: string; busqueda?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.sucursalId) qs.set('sucursalId', params.sucursalId);
  if (params.busqueda) qs.set('busqueda', params.busqueda);
  const query = qs.toString();
  return useQuery({
    queryKey: ['admin', 'subpreparaciones', params],
    queryFn: () =>
      api<{ subpreparaciones: Subpreparacion[] }>(`/subpreparaciones${query ? `?${query}` : ''}`),
    select: (d) => d.subpreparaciones,
  });
}

export interface CambiarModoStockInput {
  modoStock: ModoStockReceta;
  productoInventarioId?: string | null;
  unidadMedidaEspejo?: UnidadMedida;
}

export function useCambiarModoStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & CambiarModoStockInput) =>
      api<{ receta: RecetaConModo }>(`/subpreparaciones/${id}/modo-stock`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'subpreparaciones'] });
    },
  });
}

export interface ProducirLoteInput {
  sucursalId: string;
  cantidad: number;
  notas?: string;
}

export function useProducirLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & ProducirLoteInput) =>
      api<{
        produccion: {
          productoVentaId: string;
          sucursalId: string;
          cantidadProducida: number;
          insumosConsumidos: number;
        };
      }>(`/subpreparaciones/${id}/producir`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'subpreparaciones'] });
    },
  });
}
