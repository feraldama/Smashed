import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export type UnidadMedida =
  | 'UNIDAD'
  | 'KILOGRAMO'
  | 'GRAMO'
  | 'LITRO'
  | 'MILILITRO'
  | 'PORCION'
  | 'DOCENA';

export interface Insumo {
  id: string;
  codigo: string | null;
  codigoBarras: string | null;
  nombre: string;
  descripcion: string | null;
  unidadMedida: UnidadMedida;
  costoUnitario: string;
  categoria: string | null;
  activo: boolean;
  proveedor: { id: string; razonSocial: string } | null;
  stock: {
    stockActual: string;
    stockMinimo: string;
    stockMaximo: string | null;
  } | null;
}

export interface InsumoDetalle extends Omit<Insumo, 'stock'> {
  stockSucursal: Array<{
    id: string;
    stockActual: string;
    stockMinimo: string;
    stockMaximo: string | null;
    sucursal: { id: string; nombre: string; codigo: string };
  }>;
}

export function useInsumos(
  filtros: {
    busqueda?: string;
    categoria?: string;
    proveedorId?: string;
    sucursalId?: string;
  } = {},
) {
  const params = new URLSearchParams();
  if (filtros.busqueda) params.set('busqueda', filtros.busqueda);
  if (filtros.categoria) params.set('categoria', filtros.categoria);
  if (filtros.proveedorId) params.set('proveedorId', filtros.proveedorId);
  if (filtros.sucursalId) params.set('sucursalId', filtros.sucursalId);
  const qs = params.toString();
  return useQuery({
    queryKey: ['admin', 'insumos', filtros],
    queryFn: () =>
      api<{ insumos: Insumo[]; sucursalAplicada: string | null }>(
        `/inventario${qs ? `?${qs}` : ''}`,
      ),
  });
}

export function useInsumo(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'insumo', id],
    queryFn: () => api<{ insumo: InsumoDetalle }>(`/inventario/${id!}`),
    enabled: Boolean(id),
    select: (d) => d.insumo,
  });
}

interface InsumoInput {
  codigo?: string;
  codigoBarras?: string;
  nombre: string;
  descripcion?: string;
  unidadMedida: UnidadMedida;
  costoUnitario?: number;
  categoria?: string;
  proveedorId?: string;
}

export function useCrearInsumo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InsumoInput) =>
      api<{ insumo: Insumo }>('/inventario', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'insumos'] }),
  });
}

export function useActualizarInsumo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<InsumoInput>) =>
      api<{ insumo: Insumo }>(`/inventario/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'insumos'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'insumo', vars.id] });
    },
  });
}

export function useEliminarInsumo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/inventario/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'insumos'] }),
  });
}

interface AjusteStockInput {
  productoInventarioId: string;
  sucursalId: string;
  tipo: 'ENTRADA_AJUSTE' | 'SALIDA_AJUSTE' | 'SALIDA_MERMA' | 'SALIDA_CONSUMO_INTERNO';
  cantidad: number;
  motivo: string;
}

export function useAjustarStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AjusteStockInput) =>
      api<{ stock: { stockActual: string } }>('/inventario/ajustes', {
        method: 'POST',
        body: input,
      }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'insumos'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'insumo', vars.productoInventarioId] });
    },
  });
}

// ───── Receta (en módulo catalogo del backend) ─────

interface RecetaItemInput {
  productoInventarioId?: string;
  subProductoVentaId?: string;
  cantidad: number;
  unidadMedida: UnidadMedida;
  esOpcional?: boolean;
  notas?: string;
}

interface RecetaInput {
  rinde: number;
  notas?: string;
  items: RecetaItemInput[];
}

export function useSetReceta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productoId, ...input }: { productoId: string } & RecetaInput) =>
      api<{ receta: unknown }>(`/catalogo/productos/${productoId}/receta`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'producto', vars.productoId] });
    },
  });
}

export function useEliminarReceta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productoId: string) =>
      api<void>(`/catalogo/productos/${productoId}/receta`, { method: 'DELETE' }),
    onSuccess: (_d, productoId) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'producto', productoId] });
    },
  });
}
