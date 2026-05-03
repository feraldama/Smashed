import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface MenuItemConfig {
  path: string;
  label: string;
  grupo: string;
  bloqueado: { rol: string; razon: string }[];
}

export interface MatrizMenuRol {
  menus: MenuItemConfig[];
  rolesConfigurables: string[];
  /** Map rol → paths permitidos. Incluye SUPER_ADMIN: ['*' o lista completa] (read-only). */
  asignaciones: Record<string, string[]>;
}

export function useMatrizMenuRol() {
  return useQuery({
    queryKey: ['admin', 'menu-rol'],
    queryFn: () => api<MatrizMenuRol>('/menu-rol'),
  });
}

export function useGuardarMatriz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (asignaciones: Record<string, string[]>) =>
      api<MatrizMenuRol>('/menu-rol', { method: 'PUT', body: { asignaciones } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'menu-rol'] }),
  });
}

export function useResetearMatriz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<MatrizMenuRol>('/menu-rol/reset', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'menu-rol'] }),
  });
}
