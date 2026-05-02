import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface Proveedor {
  id: string;
  razonSocial: string;
  ruc: string | null;
  dv: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  contacto: string | null;
  notas: string | null;
  activo: boolean;
}

export interface ProveedorDetalle extends Proveedor {
  _count: { productosInv: number; compras: number };
}

export function useProveedores(busqueda?: string) {
  const params = busqueda ? `?busqueda=${encodeURIComponent(busqueda)}` : '';
  return useQuery({
    queryKey: ['admin', 'proveedores', busqueda],
    queryFn: () => api<{ proveedores: Proveedor[] }>(`/proveedores${params}`),
    select: (d) => d.proveedores,
  });
}

export function useProveedor(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'proveedor', id],
    queryFn: () => api<{ proveedor: ProveedorDetalle }>(`/proveedores/${id ?? ''}`),
    enabled: Boolean(id),
    select: (d) => d.proveedor,
  });
}

interface ProveedorInput {
  razonSocial: string;
  ruc?: string;
  dv?: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  contacto?: string;
  notas?: string;
}

export function useCrearProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProveedorInput) =>
      api<{ proveedor: Proveedor }>('/proveedores', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'proveedores'] }),
  });
}

export function useActualizarProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<ProveedorInput>) =>
      api<{ proveedor: Proveedor }>(`/proveedores/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'proveedores'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'proveedor', vars.id] });
    },
  });
}

export function useEliminarProveedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/proveedores/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'proveedores'] }),
  });
}
