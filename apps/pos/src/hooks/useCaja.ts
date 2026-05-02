import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface Caja {
  id: string;
  nombre: string;
  estado: 'ABIERTA' | 'CERRADA';
  puntoExpedicion: { codigo: string; descripcion: string | null } | null;
  sesionActiva: {
    aperturaId: string;
    abiertaEn: string;
    montoInicial: string;
    usuario: { id: string; nombreCompleto: string };
  } | null;
}

export interface AperturaDetalle {
  id: string;
  cajaId: string;
  montoInicial: string;
  abiertaEn: string;
  notas: string | null;
  caja: { id: string; nombre: string; sucursalId: string };
  cierre: unknown | null;
  movimientos: {
    id: string;
    tipo: string;
    metodoPago: string | null;
    monto: string;
    concepto: string | null;
    createdAt: string;
    comprobanteId: string | null;
  }[];
  totales: {
    totalVentas: string;
    totalEsperadoEfectivo: string;
    totalesPorMetodo: Record<string, string>;
  };
}

export function useCajas() {
  return useQuery({
    queryKey: ['caja', 'cajas'],
    queryFn: () => api<{ cajas: Caja[] }>('/cajas'),
    select: (data) => data.cajas,
    staleTime: 5_000,
  });
}

export function useAperturaActiva() {
  return useQuery({
    queryKey: ['caja', 'apertura', 'activa'],
    queryFn: () =>
      api<{
        apertura: {
          id: string;
          montoInicial: string;
          abiertaEn: string;
          caja: { id: string; nombre: string; puntoExpedicion: { codigo: string } | null };
        } | null;
      }>('/cajas/aperturas/activa'),
    select: (data) => data.apertura,
  });
}

export function useApertura(aperturaId: string | undefined) {
  return useQuery({
    queryKey: ['caja', 'apertura', aperturaId],
    queryFn: () => api<{ apertura: AperturaDetalle }>(`/cajas/aperturas/${aperturaId!}`),
    select: (data) => data.apertura,
    enabled: Boolean(aperturaId),
    staleTime: 2_000,
  });
}

export function useAbrirCaja() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { cajaId: string; montoInicial: number; notas?: string }) =>
      api<{ apertura: { id: string; montoInicial: string; cajaId: string } }>(
        `/cajas/${input.cajaId}/abrir`,
        { method: 'POST', body: { montoInicial: input.montoInicial, notas: input.notas } },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['caja'] });
    },
  });
}

export function useCerrarCaja() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      aperturaId: string;
      totalContadoEfectivo: number;
      conteoEfectivo?: Record<string, number>;
      notas?: string;
    }) =>
      api<{ cierre: { id: string; diferenciaEfectivo: string; totalEsperadoEfectivo: string } }>(
        `/cajas/aperturas/${input.aperturaId}/cerrar`,
        {
          method: 'POST',
          body: {
            totalContadoEfectivo: input.totalContadoEfectivo,
            conteoEfectivo: input.conteoEfectivo,
            notas: input.notas,
          },
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['caja'] });
    },
  });
}

export function useRegistrarMovimientoCaja() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      aperturaId: string;
      tipo: 'INGRESO_EXTRA' | 'EGRESO' | 'RETIRO_PARCIAL';
      monto: number;
      concepto: string;
    }) =>
      api(`/cajas/aperturas/${input.aperturaId}/movimientos`, {
        method: 'POST',
        body: { tipo: input.tipo, monto: input.monto, concepto: input.concepto },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['caja'] });
    },
  });
}
