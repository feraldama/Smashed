import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface ComprobanteDetalle {
  id: string;
  numeroDocumento: string;
  tipoDocumento: 'TICKET' | 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
  estado: 'EMITIDO' | 'ANULADO';
  condicionVenta: 'CONTADO' | 'CREDITO';
  fechaEmision: string;
  total: string;
  subtotalIva10: string;
  subtotalIva5: string;
  subtotalExentas: string;
  totalIva10: string;
  totalIva5: string;
  totalDescuento: string;
  // Campos SIFEN — null en Fase 2, se llenan en Fase 4
  cdc: string | null;
  qrUrl: string | null;
  estadoSifen: string;
  // Snapshot del receptor
  receptorRazonSocial: string;
  receptorRuc: string | null;
  receptorDv: string | null;
  receptorDocumento: string | null;
  receptorEmail: string | null;
  receptorTipoContribuyente: string;
  // Items snapshot
  items: Array<{
    id: string;
    codigo: string | null;
    descripcion: string;
    cantidad: number;
    precioUnitario: string;
    descuentoUnitario: string;
    tasaIva: 'IVA_10' | 'IVA_5' | 'IVA_0' | 'EXENTO';
    subtotal: string;
  }>;
  pagos: Array<{
    id: string;
    metodo: string;
    monto: string;
    referencia: string | null;
  }>;
  timbrado: { numero: string; fechaFinVigencia: string };
  emitidoPor: { id: string; nombreCompleto: string };
  sucursal: { nombre: string; direccion: string };
  empresa: { razonSocial: string; ruc: string; dv: string; direccion: string | null };
  pedido: { id: string; numero: number } | null;
}

export function useComprobante(id: string | null) {
  return useQuery({
    queryKey: ['comprobante', id],
    queryFn: () => api<{ comprobante: ComprobanteDetalle }>(`/comprobantes/${id!}`),
    enabled: Boolean(id),
    select: (d) => d.comprobante,
  });
}
