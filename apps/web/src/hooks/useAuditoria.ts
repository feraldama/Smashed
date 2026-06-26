import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

/** Acciones auditables — espejo del enum `AccionAuditable` de Prisma, con
 *  etiqueta amigable para el filtro y los badges. */
export const ACCIONES_AUDITABLES: Record<string, string> = {
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  LOGIN_FALLIDO: 'Login fallido',
  CREAR: 'Crear',
  ACTUALIZAR: 'Actualizar',
  ELIMINAR: 'Eliminar',
  ANULAR_COMPROBANTE: 'Anular comprobante',
  AJUSTAR_STOCK: 'Ajustar stock',
  TRANSFERENCIA_STOCK: 'Transferencia de stock',
  CAMBIO_PRECIO: 'Cambio de precio',
  APERTURA_CAJA: 'Apertura de caja',
  CIERRE_CAJA: 'Cierre de caja',
  MOVIMIENTO_CAJA: 'Movimiento de caja',
  CAMBIO_PERMISO: 'Cambio de permiso',
  APLICAR_DESCUENTO: 'Aplicar descuento',
  REMOVER_DESCUENTO: 'Remover descuento',
};

export interface AuditLogItem {
  id: string;
  accion: string;
  entidad: string | null;
  entidadId: string | null;
  ip: string | null;
  metadata: unknown;
  diff: unknown;
  createdAt: string;
  usuario: { id: string; nombreCompleto: string; email: string } | null;
  sucursal: { id: string; nombre: string } | null;
}

export interface AuditoriaFiltros {
  accion?: string;
  usuarioId?: string;
  entidad?: string;
  desde?: string;
  hasta?: string;
  page?: number;
  pageSize?: number;
}

export function useAuditoria(filtros: AuditoriaFiltros = {}) {
  const params = new URLSearchParams();
  if (filtros.accion) params.set('accion', filtros.accion);
  if (filtros.usuarioId) params.set('usuarioId', filtros.usuarioId);
  if (filtros.entidad) params.set('entidad', filtros.entidad);
  if (filtros.desde) params.set('desde', filtros.desde);
  if (filtros.hasta) params.set('hasta', filtros.hasta);
  params.set('page', String(filtros.page ?? 1));
  params.set('pageSize', String(filtros.pageSize ?? 50));
  const qs = params.toString();
  return useQuery({
    queryKey: ['admin', 'auditoria', filtros],
    queryFn: () =>
      api<{ items: AuditLogItem[]; total: number; page: number; pageSize: number }>(
        `/auditoria?${qs}`,
      ),
    placeholderData: (prev) => prev,
  });
}
