import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

// ───── Types ─────

export type EstadoComprobante = 'EMITIDO' | 'ANULADO';

export type EstadoSifen =
  | 'NO_ENVIADO'
  | 'PENDIENTE'
  | 'APROBADO'
  | 'RECHAZADO'
  | 'CANCELADO'
  | 'INUTILIZADO';

export type TipoDocumentoFiscal =
  | 'TICKET'
  | 'FACTURA'
  | 'NOTA_CREDITO'
  | 'NOTA_DEBITO'
  | 'AUTOFACTURA'
  | 'NOTA_REMISION';

export interface ComprobanteResumen {
  id: string;
  numeroDocumento: string;
  tipoDocumento: TipoDocumentoFiscal;
  estado: EstadoComprobante;
  estadoSifen: EstadoSifen;
  cdc: string | null;
  total: string;
  fechaEmision: string;
  cliente: { id: string; razonSocial: string; ruc: string | null; dv: string | null } | null;
  pedido: { id: string; numero: number } | null;
}

export interface ItemComprobante {
  id: string;
  codigo: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: string;
  descuentoUnitario: string;
  tasaIva: 'IVA_10' | 'IVA_5' | 'IVA_0' | 'EXENTO';
  subtotal: string;
}

export interface PagoComprobante {
  id: string;
  metodo: string;
  monto: string;
  referencia: string | null;
}

export interface EventoSifen {
  id: string;
  tipo: string;
  estado: string;
  motivo: string | null;
  xmlEnviado: string | null;
  xmlRespuesta: string | null;
  enviadoEn: string;
  respondidoEn: string | null;
}

export interface ComprobanteDetalle {
  id: string;
  empresaId: string;
  sucursalId: string;
  tipoDocumento: TipoDocumentoFiscal;
  numeroDocumento: string;
  numero: number;
  establecimiento: string;
  puntoExpedicionCodigo: string;
  fechaEmision: string;
  condicionVenta: 'CONTADO' | 'CREDITO';
  estado: EstadoComprobante;
  receptorTipoContribuyente: string;
  receptorRuc: string | null;
  receptorDv: string | null;
  receptorDocumento: string | null;
  receptorRazonSocial: string;
  receptorEmail: string | null;
  subtotalExentas: string;
  subtotalIva5: string;
  subtotalIva10: string;
  totalIva5: string;
  totalIva10: string;
  total: string;
  cdc: string | null;
  xmlFirmado: string | null;
  estadoSifen: EstadoSifen;
  fechaEnvioSifen: string | null;
  fechaAprobacionSifen: string | null;
  motivoRechazoSifen: string | null;
  qrUrl: string | null;
  anuladoEn: string | null;
  motivoAnulacion: string | null;
  items: ItemComprobante[];
  pagos: PagoComprobante[];
  cliente: {
    id: string;
    razonSocial: string;
    ruc: string | null;
    dv: string | null;
    documento: string | null;
  };
  empresa: { razonSocial: string; ruc: string; dv: string; direccion: string | null };
  sucursal: { nombre: string; direccion: string };
  emitidoPor: { id: string; nombreCompleto: string };
  timbrado: { numero: string; fechaFinVigencia: string };
  eventosSifen: EventoSifen[];
}

// ───── Listado / detalle ─────

export interface ComprobantesFiltros {
  estado?: 'EMITIDO' | 'ANULADO';
  desde?: string; // ISO date
  hasta?: string;
  pageSize?: number;
}

export function useComprobantes(filtros: ComprobantesFiltros = {}) {
  const params = new URLSearchParams();
  if (filtros.estado) params.set('estado', filtros.estado);
  if (filtros.desde) params.set('desde', filtros.desde);
  if (filtros.hasta) params.set('hasta', filtros.hasta);
  if (filtros.pageSize) params.set('pageSize', String(filtros.pageSize));
  const qs = params.toString() ? `?${params.toString()}` : '';

  return useQuery({
    queryKey: ['admin', 'comprobantes', filtros],
    queryFn: () => api<{ comprobantes: ComprobanteResumen[] }>(`/comprobantes${qs}`),
    select: (d) => d.comprobantes,
  });
}

export function useComprobante(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'comprobante', id],
    queryFn: () => api<{ comprobante: ComprobanteDetalle }>(`/comprobantes/${id ?? ''}`),
    enabled: Boolean(id),
    select: (d) => d.comprobante,
  });
}

// ───── Emisión ─────

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

export interface EmitirComprobanteInput {
  pedidoId: string;
  clienteId?: string;
  tipoDocumento?: TipoDocumentoFiscal;
  condicionVenta?: 'CONTADO' | 'CREDITO';
  pagos: { metodo: MetodoPago; monto: number; referencia?: string }[];
  notas?: string;
  numeroPager?: number;
}

export function useEmitirComprobante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EmitirComprobanteInput) =>
      api<{ comprobante: ComprobanteDetalle }>('/comprobantes', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'comprobantes'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'caja', 'mi-apertura'] });
    },
  });
}

// ───── Acciones SIFEN ─────

export interface EnviarSifenResponse {
  comprobanteId: string;
  cdc: string;
  estadoSifen: EstadoSifen;
  protocolo: string | null;
  mensaje: string;
  qrUrl: string | null;
}

export function useEnviarSifen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<EnviarSifenResponse>(`/comprobantes/${id}/sifen/enviar`, { method: 'POST' }),
    onSuccess: (_d, id) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'comprobante', id] });
      void qc.invalidateQueries({ queryKey: ['admin', 'comprobantes'] });
    },
  });
}

export interface CancelarSifenResponse {
  comprobanteId: string;
  estadoSifen: EstadoSifen;
  mensaje: string;
  aprobado: boolean;
}

export function useCancelarSifen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api<CancelarSifenResponse>(`/comprobantes/${id}/sifen/cancelar`, {
        method: 'POST',
        body: { motivo },
      }),
    onSuccess: (_d, { id }) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'comprobante', id] });
      void qc.invalidateQueries({ queryKey: ['admin', 'comprobantes'] });
    },
  });
}

export interface EstadoSifenResponse {
  comprobanteId: string;
  cdc: string;
  estadoLocal: EstadoSifen;
  estadoSifen: string;
  protocolo: string | null;
  mensaje: string;
  procesado: boolean;
}

export function useConsultarEstadoSifen(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'comprobante', id, 'sifen-estado'],
    queryFn: () => api<EstadoSifenResponse>(`/comprobantes/${id ?? ''}/sifen/estado`),
    enabled: false, // sólo se dispara con refetch() manual
    retry: false,
  });
}
