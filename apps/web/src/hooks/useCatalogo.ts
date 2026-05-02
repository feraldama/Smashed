import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

// ───── Tipos ─────

export interface Categoria {
  id: string;
  nombre: string;
  categoriaBase: string;
  ordenMenu: number;
  iconoUrl: string | null;
  totalProductos: number;
}

export interface ProductoListado {
  id: string;
  codigo: string | null;
  codigoBarras: string | null;
  nombre: string;
  descripcion: string | null;
  precio: string;
  precioBase: string;
  tasaIva: string;
  imagenUrl: string | null;
  sectorComanda: string | null;
  esCombo: boolean;
  esVendible: boolean;
  tienePrecioSucursal: boolean;
  categoria: { id: string; nombre: string; categoriaBase: string } | null;
}

export interface ProductoDetalle extends ProductoListado {
  tiempoPrepSegundos: number | null;
  esPreparacion: boolean;
  receta: unknown;
  combo: ComboConfig | null;
  modificadorGrupos: unknown[];
}

// ───── Combo (config) ─────

export interface ComboOpcion {
  id: string;
  comboGrupoId: string;
  productoVentaId: string;
  precioExtra: string;
  esDefault: boolean;
  orden: number;
  productoVenta: {
    id: string;
    codigo: string | null;
    nombre: string;
    precioBase: string;
    imagenUrl: string | null;
  };
}

export interface ComboGrupoConfig {
  id: string;
  comboId: string;
  nombre: string;
  orden: number;
  tipo: 'UNICA' | 'MULTIPLE';
  obligatorio: boolean;
  opciones: ComboOpcion[];
}

export interface ComboConfig {
  id: string;
  productoVentaId: string;
  descripcion: string | null;
  grupos: ComboGrupoConfig[];
}

export interface SetComboInput {
  descripcion?: string;
  grupos: {
    nombre: string;
    orden: number;
    obligatorio: boolean;
    opciones: {
      productoVentaId: string;
      precioExtra: number;
      esDefault: boolean;
      orden: number;
    }[];
  }[];
}

// ───── Categorías ─────

export function useCategorias() {
  return useQuery({
    queryKey: ['admin', 'categorias'],
    queryFn: () => api<{ categorias: Categoria[] }>('/catalogo/categorias'),
    select: (d) => d.categorias,
  });
}

interface CrearCategoriaInput {
  nombre: string;
  codigo?: string;
  categoriaBase?: string;
  ordenMenu?: number;
  iconoUrl?: string;
}

export function useCrearCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearCategoriaInput) =>
      api<{ categoria: Categoria }>('/catalogo/categorias', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'categorias'] });
    },
  });
}

export function useActualizarCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: { id: string } & Partial<CrearCategoriaInput> & { activa?: boolean }) =>
      api<{ categoria: Categoria }>(`/catalogo/categorias/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'categorias'] });
    },
  });
}

export function useEliminarCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/catalogo/categorias/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'categorias'] });
    },
  });
}

// ───── Productos ─────

export function useProductos(
  filtros: {
    categoriaId?: string;
    busqueda?: string;
    incluirNoVendibles?: boolean;
    esCombo?: boolean;
  } = {},
) {
  const params = new URLSearchParams();
  if (filtros.categoriaId) params.set('categoriaId', filtros.categoriaId);
  if (filtros.busqueda) params.set('busqueda', filtros.busqueda);
  if (filtros.incluirNoVendibles) params.set('incluirNoVendibles', 'true');
  if (filtros.esCombo !== undefined) params.set('esCombo', String(filtros.esCombo));
  const qs = params.toString();
  return useQuery({
    queryKey: ['admin', 'productos', filtros],
    queryFn: () =>
      api<{ productos: ProductoListado[] }>(`/catalogo/productos${qs ? `?${qs}` : ''}`),
    select: (d) => d.productos,
  });
}

export function useProductoDetalle(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'producto', id],
    queryFn: () => api<{ producto: ProductoDetalle }>(`/catalogo/productos/${id ?? ''}`),
    enabled: Boolean(id),
    select: (d) => d.producto,
  });
}

interface CrearProductoInput {
  categoriaId?: string;
  codigo?: string;
  codigoBarras?: string;
  nombre: string;
  descripcion?: string;
  precioBase: number;
  tasaIva?: 'IVA_10' | 'IVA_5' | 'IVA_0' | 'EXENTO';
  imagenUrl?: string;
  sectorComanda?: string;
  tiempoPrepSegundos?: number;
  esCombo?: boolean;
  esVendible?: boolean;
  esPreparacion?: boolean;
}

export function useCrearProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearProductoInput) =>
      api<{ producto: ProductoListado }>('/catalogo/productos', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'productos'] });
    },
  });
}

export function useActualizarProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: { id: string } & Partial<CrearProductoInput> & { activo?: boolean }) =>
      api<{ producto: ProductoListado }>(`/catalogo/productos/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'productos'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'producto', vars.id] });
    },
  });
}

export function useEliminarProducto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/catalogo/productos/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'productos'] });
    },
  });
}

export function useSetCombo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SetComboInput }) =>
      api<{ combo: ComboConfig }>(`/catalogo/productos/${id}/combo`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'productos'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'producto', vars.id] });
    },
  });
}

export function useEliminarCombo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/catalogo/productos/${id}/combo`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'productos'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'producto', id] });
    },
  });
}
