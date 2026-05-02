import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

interface Categoria {
  id: string;
  nombre: string;
  categoriaBase: string;
  ordenMenu: number;
  totalProductos: number;
}

export interface ProductoListado {
  id: string;
  codigo: string | null;
  codigoBarras: string | null;
  nombre: string;
  descripcion: string | null;
  precio: string; // BigInt serializado
  precioBase: string;
  tasaIva: string;
  imagenUrl: string | null;
  sectorComanda: string | null;
  esCombo: boolean;
  esVendible: boolean;
  tienePrecioSucursal: boolean;
  categoria: { id: string; nombre: string; categoriaBase: string } | null;
}

export function useCategorias() {
  return useQuery({
    queryKey: ['catalogo', 'categorias'],
    queryFn: () => api<{ categorias: Categoria[] }>('/catalogo/categorias'),
    select: (data) => data.categorias,
  });
}

export function useProductos(filtros: { categoriaId?: string; busqueda?: string } = {}) {
  const params = new URLSearchParams();
  if (filtros.categoriaId) params.set('categoriaId', filtros.categoriaId);
  if (filtros.busqueda) params.set('busqueda', filtros.busqueda);
  const qs = params.toString();

  return useQuery({
    queryKey: ['catalogo', 'productos', filtros],
    queryFn: () =>
      api<{ productos: ProductoListado[]; sucursalActivaId: string | null }>(
        `/catalogo/productos${qs ? `?${qs}` : ''}`,
      ),
  });
}
