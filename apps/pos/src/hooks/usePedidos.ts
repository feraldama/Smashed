import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CartItem } from '@/lib/cart-store';

import { api } from '@/lib/api';

export interface ProductoDetalle {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: string;
  precioBase: string;
  tasaIva: string;
  imagenUrl: string | null;
  esCombo: boolean;
  combo: {
    id: string;
    descripcion: string | null;
    grupos: Array<{
      id: string;
      nombre: string;
      orden: number;
      tipo: string;
      obligatorio: boolean;
      opciones: Array<{
        id: string;
        precioExtra: string;
        esDefault: boolean;
        orden: number;
        productoVenta: {
          id: string;
          codigo: string | null;
          nombre: string;
          imagenUrl: string | null;
        };
      }>;
    }>;
  } | null;
  modificadorGrupos: Array<{
    productoVentaId: string;
    modificadorGrupoId: string;
    ordenEnProducto: number;
    modificadorGrupo: {
      id: string;
      nombre: string;
      tipo: string; // 'UNICA' | 'MULTIPLE'
      obligatorio: boolean;
      minSeleccion: number;
      maxSeleccion: number | null;
      opciones: Array<{
        id: string;
        nombre: string;
        precioExtra: string;
        orden: number;
      }>;
    };
  }>;
}

export function useProductoDetalle(productoId: string | null) {
  return useQuery({
    queryKey: ['catalogo', 'producto', productoId],
    queryFn: () => api<{ producto: ProductoDetalle }>(`/catalogo/productos/${productoId!}`),
    enabled: Boolean(productoId),
    select: (d) => d.producto,
  });
}

interface CrearPedidoInput {
  tipo: 'MOSTRADOR' | 'MESA' | 'DELIVERY_PROPIO' | 'RETIRO_LOCAL';
  clienteId?: string;
  mesaId?: string;
  direccionEntregaId?: string;
  observaciones?: string;
  items: Array<{
    productoVentaId: string;
    cantidad: number;
    observaciones?: string;
    modificadores?: Array<{ modificadorOpcionId: string }>;
    combosOpcion?: Array<{ comboGrupoId: string; comboGrupoOpcionId: string }>;
  }>;
}

export function useCrearPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CrearPedidoInput) =>
      api<{ pedido: { id: string; numero: number; total: string; estado: string } }>('/pedidos', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pedidos'] });
    },
  });
}

export function useConfirmarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pedidoId: string) =>
      api<{ pedido: { id: string; estado: string } }>(`/pedidos/${pedidoId}/confirmar`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pedidos'] });
    },
  });
}

export type MetodoPagoCode =
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

interface EmitirComprobanteInput {
  pedidoId: string;
  clienteId?: string;
  tipoDocumento?: 'TICKET' | 'FACTURA';
  pagos: Array<{ metodo: MetodoPagoCode; monto: number; referencia?: string }>;
}

interface ComprobanteResp {
  id: string;
  numeroDocumento: string;
  tipoDocumento: string;
  total: string;
  estado: string;
}

export function useEmitirComprobante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EmitirComprobanteInput) =>
      api<{ comprobante: ComprobanteResp }>('/comprobantes', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['caja'] });
      void qc.invalidateQueries({ queryKey: ['pedidos'] });
    },
  });
}

interface MetadataInput {
  tipo: CrearPedidoInput['tipo'];
  mesaId?: string | null;
  clienteId?: string | null;
  direccionEntregaId?: string | null;
  observaciones?: string | null;
}

/** Convierte el carrito local al payload que espera el API. */
export function cartToPedidoInput(items: CartItem[], meta: MetadataInput): CrearPedidoInput {
  return {
    tipo: meta.tipo,
    mesaId: meta.mesaId ?? undefined,
    clienteId: meta.clienteId ?? undefined,
    direccionEntregaId: meta.direccionEntregaId ?? undefined,
    observaciones: meta.observaciones ?? undefined,
    items: items.map((it) => ({
      productoVentaId: it.productoVentaId,
      cantidad: it.cantidad,
      observaciones: it.observaciones || undefined,
      modificadores: it.modificadores.length
        ? it.modificadores.map((m) => ({ modificadorOpcionId: m.modificadorOpcionId }))
        : undefined,
      combosOpcion: it.combosOpcion.length
        ? it.combosOpcion.map((c) => ({
            comboGrupoId: c.comboGrupoId,
            comboGrupoOpcionId: c.comboGrupoOpcionId,
          }))
        : undefined,
    })),
  };
}
