import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

// ───── Types ─────

export type EstadoCaja = 'ABIERTA' | 'CERRADA';

export type TipoMovimiento =
  | 'APERTURA'
  | 'VENTA'
  | 'COBRANZA'
  | 'INGRESO_EXTRA'
  | 'EGRESO'
  | 'RETIRO_PARCIAL'
  | 'CIERRE';

export type MetodoPago =
  | 'EFECTIVO'
  | 'TARJETA_DEBITO'
  | 'TARJETA_CREDITO'
  | 'TRANSFERENCIA'
  | 'CHEQUE'
  | 'BANCARD'
  | 'INFONET'
  | 'ZIMPLE'
  | 'TIGO_MONEY'
  | 'PERSONAL_PAY';

export interface CajaListItem {
  id: string;
  nombre: string;
  estado: EstadoCaja;
  puntoExpedicion: { codigo: string; descripcion: string | null } | null;
  sesionActiva: {
    aperturaId: string;
    abiertaEn: string;
    montoInicial: string;
    usuario: { id: string; nombreCompleto: string };
  } | null;
}

export interface MovimientoApertura {
  id: string;
  tipo: TipoMovimiento;
  metodoPago: MetodoPago | null;
  monto: string;
  concepto: string | null;
  createdAt: string;
  comprobanteId: string | null;
}

export interface AperturaActivaSlim {
  id: string;
  abiertaEn: string;
  montoInicial: string;
  cajaId: string;
  caja: {
    id: string;
    nombre: string;
    sucursalId: string;
    puntoExpedicion: { codigo: string } | null;
  };
}

export interface AperturaDetalle extends AperturaActivaSlim {
  notas: string | null;
  usuario: { id: string; nombreCompleto: string };
  cierre: unknown;
  movimientos: MovimientoApertura[];
  totales: {
    totalVentas: string;
    totalEsperadoEfectivo: string;
    totalesPorMetodo: Record<string, string>;
  };
}

// ───── Hooks ─────

export function useCajas() {
  return useQuery({
    queryKey: ['admin', 'cajas'],
    queryFn: () => api<{ cajas: CajaListItem[] }>('/cajas'),
    select: (d) => d.cajas,
  });
}

export function useMiAperturaActiva() {
  return useQuery({
    queryKey: ['admin', 'caja', 'mi-apertura'],
    queryFn: () => api<{ apertura: AperturaActivaSlim | null }>('/cajas/aperturas/activa'),
    select: (d) => d.apertura,
  });
}

export function useApertura(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'apertura', id],
    queryFn: () => api<{ apertura: AperturaDetalle }>(`/cajas/aperturas/${id ?? ''}`),
    enabled: Boolean(id),
    select: (d) => d.apertura,
    refetchInterval: 10_000, // refresh cada 10s para ver ventas que se van sumando
  });
}

// ───── Mutations ─────

export function useAbrirCaja() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      cajaId,
      montoInicial,
      notas,
    }: {
      cajaId: string;
      montoInicial: number;
      notas?: string;
    }) =>
      api<{ apertura: AperturaActivaSlim }>(`/cajas/${cajaId}/abrir`, {
        method: 'POST',
        body: { montoInicial, notas },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'cajas'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'caja', 'mi-apertura'] });
    },
  });
}

export interface CerrarCajaInput {
  aperturaId: string;
  totalContadoEfectivo: number;
  conteoEfectivo?: Record<string, number>;
  notas?: string;
}

export interface CierreCajaResult {
  id: string;
  totalEsperadoEfectivo: string;
  totalContadoEfectivo: string;
  diferenciaEfectivo: string;
  totalVentas: string;
  totalesPorMetodo: Record<string, string>;
  cerradaEn: string;
}

export function useCerrarCaja() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ aperturaId, ...body }: CerrarCajaInput) =>
      api<{ cierre: CierreCajaResult }>(`/cajas/aperturas/${aperturaId}/cerrar`, {
        method: 'POST',
        body,
      }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'cajas'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'caja', 'mi-apertura'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'apertura', vars.aperturaId] });
    },
  });
}

export interface MovimientoInput {
  aperturaId: string;
  tipo: 'INGRESO_EXTRA' | 'EGRESO' | 'RETIRO_PARCIAL';
  monto: number;
  concepto: string;
}

export function useRegistrarMovimiento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ aperturaId, ...body }: MovimientoInput) =>
      api<{ movimiento: MovimientoApertura }>(`/cajas/aperturas/${aperturaId}/movimientos`, {
        method: 'POST',
        body,
      }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'apertura', vars.aperturaId] });
    },
  });
}

// ───── Helpers ─────

/** Denominaciones de guaraníes en circulación, de mayor a menor. */
export const DENOMINACIONES_PYG = [
  100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 100, 50,
] as const;

/** Calcula el monto total de un conteo de denominaciones. */
export function totalConteo(conteo: Record<string, number>): number {
  let total = 0;
  for (const [denom, cant] of Object.entries(conteo)) {
    total += Number(denom) * (cant || 0);
  }
  return total;
}
