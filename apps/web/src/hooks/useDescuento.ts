import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export type TipoDescuento = 'PORCENTAJE' | 'MONTO' | 'CORTESIA';

/** Código estable de motivos creados por el sistema. El UI lo usa para
 *  ramificar el flujo (ej. mostrar selector de empleado en lugar de tipo/valor). */
export const CODIGO_MOTIVO_DESCUENTO_EMPLEADO = 'DESCUENTO_EMPLEADO';

export interface MotivoDescuento {
  id: string;
  empresaId: string;
  nombre: string;
  requiereAutorizacion: boolean;
  activo: boolean;
  ordenMenu: number;
  esSistema: boolean;
  codigoSistema: string | null;
}

export interface LimiteDescuentoRol {
  empresaId: string;
  rol: string;
  maxPorcentaje: number;
  puedeAutorizarOtros: boolean;
  puedeUsarCortesia: boolean;
}

export interface CodigoAutorizacionDescuento {
  id: string;
  codigo: string;
  maxPorcentaje: number;
  expiraEn: string;
  usadoEn: string | null;
  createdAt: string;
  creadoPor: { id: string; nombreCompleto: string };
}

export interface PedidoConDescuento {
  id: string;
  total: string;
  subtotal: string;
  totalIva: string;
  recargoDelivery: string;
  totalDescuento: string;
  descuentoTipo: TipoDescuento | null;
  descuentoValor: string;
  descuentoObservacion: string | null;
  descuentoAplicadoPorId: string | null;
  descuentoAutorizadoPorId: string | null;
  codigoAutorizacionId: string | null;
  empleadoBeneficiarioId: string | null;
  motivoDescuento: { id: string; nombre: string; codigoSistema: string | null } | null;
  descuentoAplicadoPor: { id: string; nombreCompleto: string } | null;
  descuentoAutorizadoPor: { id: string; nombreCompleto: string } | null;
  empleadoBeneficiario: { id: string; nombreCompleto: string } | null;
}

// ───── Aplicar / remover ─────

export interface AplicarDescuentoInput {
  tipo: TipoDescuento;
  /** Centésimos del 1% si PORCENTAJE (10000 = 100%); Gs. si MONTO; ignorado si CORTESIA. */
  valor: number;
  motivoDescuentoId: string;
  observacion?: string;
  supervisorAuth?: { email: string; password: string };
  codigoAutorizacion?: string;
  /** Solo cuando el motivo es del sistema DESCUENTO_EMPLEADO. El backend ignora
   *  tipo/valor en ese caso y aplica el % global de ConfiguracionEmpresa. */
  empleadoBeneficiarioId?: string;
}

export function useAplicarDescuento(pedidoId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AplicarDescuentoInput) =>
      api<{ pedido: PedidoConDescuento }>(`/descuentos/pedidos/${pedidoId ?? ''}/descuento`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      if (pedidoId) {
        void qc.invalidateQueries({ queryKey: ['admin', 'pedido', pedidoId] });
        void qc.invalidateQueries({ queryKey: ['admin', 'pedidos'] });
      }
    },
  });
}

export function useRemoverDescuento(pedidoId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ pedido: PedidoConDescuento }>(`/descuentos/pedidos/${pedidoId ?? ''}/descuento`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      if (pedidoId) {
        void qc.invalidateQueries({ queryKey: ['admin', 'pedido', pedidoId] });
        void qc.invalidateQueries({ queryKey: ['admin', 'pedidos'] });
      }
    },
  });
}

// ───── Verificar supervisor (pre-check opcional) ─────

export interface SupervisorInfo {
  supervisorId: string;
  nombreCompleto: string;
  rol: string;
  maxPorcentaje: number;
  puedeUsarCortesia: boolean;
}

export function useVerificarSupervisor() {
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api<SupervisorInfo>('/descuentos/auth/verificar-supervisor', {
        method: 'POST',
        body: input,
      }),
  });
}

// ───── Motivos ─────

export function useMotivosDescuento() {
  return useQuery({
    queryKey: ['descuentos', 'motivos'],
    queryFn: () => api<{ motivos: MotivoDescuento[] }>('/descuentos/motivos'),
    select: (d) => d.motivos.filter((m) => m.activo),
  });
}

export interface MotivoInput {
  nombre: string;
  requiereAutorizacion: boolean;
  activo: boolean;
  ordenMenu: number;
}

export function useCrearMotivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MotivoInput) =>
      api<{ motivo: MotivoDescuento }>('/descuentos/motivos', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descuentos', 'motivos'] }),
  });
}

export function useActualizarMotivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<MotivoInput>) =>
      api<{ motivo: MotivoDescuento }>(`/descuentos/motivos/${id}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descuentos', 'motivos'] }),
  });
}

export function useEliminarMotivo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/descuentos/motivos/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descuentos', 'motivos'] }),
  });
}

// ───── Límites por rol ─────

export function useLimitesDescuento() {
  return useQuery({
    queryKey: ['descuentos', 'limites'],
    queryFn: () => api<{ limites: LimiteDescuentoRol[] }>('/descuentos/limites'),
    select: (d) => d.limites,
  });
}

export interface LimiteInput {
  rol: string;
  maxPorcentaje: number;
  puedeAutorizarOtros: boolean;
  puedeUsarCortesia: boolean;
}

export function useActualizarLimites() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { limites: LimiteInput[] }) =>
      api<{ limites: LimiteDescuentoRol[] }>('/descuentos/limites', {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descuentos', 'limites'] }),
  });
}

// ───── Códigos ─────

export type FiltroCodigos = 'ACTIVOS' | 'USADOS' | 'EXPIRADOS' | 'TODOS';

export function useCodigosDescuento(filtro: FiltroCodigos = 'ACTIVOS') {
  return useQuery({
    queryKey: ['descuentos', 'codigos', filtro],
    queryFn: () =>
      api<{ codigos: CodigoAutorizacionDescuento[] }>(`/descuentos/codigos?filtro=${filtro}`),
    select: (d) => d.codigos,
  });
}

export function useCrearCodigo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { maxPorcentaje: number; expiraEnHoras?: number }) =>
      api<{ codigo: CodigoAutorizacionDescuento }>('/descuentos/codigos', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descuentos', 'codigos'] }),
  });
}

export function useEliminarCodigo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/descuentos/codigos/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descuentos', 'codigos'] }),
  });
}

// ───── Empleados beneficiarios (para el modal de descuento empleado) ─────

export interface EmpleadoBeneficiario {
  id: string;
  nombreCompleto: string;
  rol: string;
}

export function useEmpleadosBeneficiarios() {
  return useQuery({
    queryKey: ['descuentos', 'empleados-beneficiarios'],
    queryFn: () =>
      api<{ empleados: EmpleadoBeneficiario[] }>('/descuentos/empleados-beneficiarios'),
    select: (d) => d.empleados,
  });
}
