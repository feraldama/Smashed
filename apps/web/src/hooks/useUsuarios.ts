import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export type Rol =
  | 'SUPER_ADMIN'
  | 'ADMIN_EMPRESA'
  | 'GERENTE_SUCURSAL'
  | 'CAJERO'
  | 'COCINA'
  | 'MESERO'
  | 'REPARTIDOR';

export interface UsuarioSucursalAsignacion {
  sucursalId: string;
  esPrincipal: boolean;
  sucursal: { id: string; nombre: string; codigo: string };
}

export interface Usuario {
  id: string;
  empresaId: string | null;
  email: string;
  nombreCompleto: string;
  documento: string | null;
  telefono: string | null;
  rol: Rol;
  activo: boolean;
  ultimoLogin: string | null;
  createdAt: string;
  updatedAt: string;
  sucursales: UsuarioSucursalAsignacion[];
}

// ───── List + detail ─────

export interface UsuariosFiltros {
  busqueda?: string;
  rol?: Rol;
  sucursalId?: string;
  incluirInactivos?: boolean;
}

export function useUsuarios(filtros: UsuariosFiltros = {}) {
  const params = new URLSearchParams();
  if (filtros.busqueda) params.set('busqueda', filtros.busqueda);
  if (filtros.rol) params.set('rol', filtros.rol);
  if (filtros.sucursalId) params.set('sucursalId', filtros.sucursalId);
  if (filtros.incluirInactivos) params.set('incluirInactivos', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery({
    queryKey: ['admin', 'usuarios', filtros],
    queryFn: () => api<{ usuarios: Usuario[] }>(`/usuarios${qs}`),
    select: (d) => d.usuarios,
  });
}

export function useUsuario(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'usuario', id],
    queryFn: () => api<{ usuario: Usuario }>(`/usuarios/${id!}`),
    enabled: Boolean(id),
    select: (d) => d.usuario,
  });
}

// ───── Mutations ─────

export interface SucursalAsignacionInput {
  sucursalId: string;
  esPrincipal: boolean;
}

export interface CrearUsuarioInput {
  email: string;
  password: string;
  nombreCompleto: string;
  documento?: string;
  telefono?: string;
  rol: Rol;
  sucursales: SucursalAsignacionInput[];
}

export interface ActualizarUsuarioInput {
  email?: string;
  nombreCompleto?: string;
  documento?: string | null;
  telefono?: string | null;
  rol?: Rol;
  activo?: boolean;
  sucursales?: SucursalAsignacionInput[];
}

export function useCrearUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearUsuarioInput) =>
      api<{ usuario: Usuario }>('/usuarios', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] }),
  });
}

export function useActualizarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & ActualizarUsuarioInput) =>
      api<{ usuario: Usuario }>(`/usuarios/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'usuario', vars.id] });
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api<{ ok: true }>(`/usuarios/${id}/reset-password`, {
        method: 'POST',
        body: { password },
      }),
  });
}

export function useEliminarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/usuarios/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] }),
  });
}

// ───── Helpers ─────

export const ROLES_DISPONIBLES: { value: Rol; label: string; description: string }[] = [
  { value: 'ADMIN_EMPRESA', label: 'Administrador', description: 'Gestiona empresa, usuarios y configuración' },
  { value: 'GERENTE_SUCURSAL', label: 'Gerente de sucursal', description: 'Gestiona productos, caja y reportes' },
  { value: 'CAJERO', label: 'Cajero/a', description: 'Vende, abre/cierra caja y emite comprobantes' },
  { value: 'MESERO', label: 'Mesero/a', description: 'Toma pedidos y entrega' },
  { value: 'COCINA', label: 'Cocinero/a', description: 'Acceso al KDS y preparación' },
  { value: 'REPARTIDOR', label: 'Repartidor/a', description: 'Entrega de delivery' },
];

export function labelRol(r: Rol): string {
  return ROLES_DISPONIBLES.find((x) => x.value === r)?.label ?? r;
}
