import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { EstadoPedido, TipoPedido } from './usePedidos';

import { api } from '@/lib/api';

export type EstadoItem = EstadoPedido;
export type SectorComanda =
  | 'COCINA_CALIENTE'
  | 'COCINA_FRIA'
  | 'PARRILLA'
  | 'BAR'
  | 'CAFETERIA'
  | 'POSTRES';

export interface KdsItemModificador {
  id: string;
  /** Snapshot del precio extra. BigInt serializado como string. ">0" = agregar (con costo). */
  precioExtra: string;
  modificadorOpcion: { nombre: string };
  /** Si tiene comboGrupo, el modificador aplica al componente del combo, no al item global. */
  comboGrupo: { id: string; nombre: string } | null;
}

export interface KdsItemCombo {
  id: string;
  estado: EstadoItem;
  sectorComanda: SectorComanda | null;
  comboGrupo: { id: string; nombre: string; orden: number };
  comboGrupoOpcion: {
    productoVenta: { nombre: string; sectorComanda: SectorComanda | null };
  };
}

export interface KdsItem {
  id: string;
  cantidad: number;
  estado: EstadoItem;
  observaciones: string | null;
  productoVenta: {
    id: string;
    nombre: string;
    sectorComanda: SectorComanda | null;
    tiempoPrepSegundos: number | null;
  };
  modificadores: KdsItemModificador[];
  combosOpcion: KdsItemCombo[];
}

export interface KdsPedido {
  id: string;
  numero: number;
  tipo: TipoPedido;
  estado: EstadoPedido;
  observaciones: string | null;
  numeroPager: number | null;
  confirmadoEn: string | null;
  enPreparacionEn: string | null;
  /** Momento de entrega al cliente. Sólo viene poblado en la vista "entregados". */
  entregadoEn: string | null;
  mesa: { id: string; numero: number } | null;
  cliente: { id: string; razonSocial: string } | null;
  items: KdsItem[];
}

/**
 * Modo de la pantalla KDS:
 *  - `mostrador`: pedidos activos sin entregar (vista completa para entregar).
 *  - `entregados`: pedidos ya entregados hoy (recall — sólo lectura + reabrir).
 *  - un `SectorComanda`: estación de preparación (cocina, bar, etc.).
 */
export type VistaKds = 'mostrador' | 'entregados' | SectorComanda;

/**
 * Listado de pedidos activos para KDS, opcionalmente filtrado por sector.
 *
 * Sin sector → vista mostrador: pedido completo, todos los items y opciones,
 * para verificar que está todo listo antes de entregar al cliente.
 *
 * Con sector → vista por estación (cocina caliente, bar, parrilla...): sólo
 * pedidos con sub-tareas de ese sector aún pendientes. Cocina ve cocina, bar
 * ve bar — cada uno marca lo suyo sin pisarse.
 *
 * `entregados` → recall: pedidos ya entregados hoy, sólo lectura. Polling más
 * lento porque no es una vista operativa urgente.
 *
 * Polling cada 5s — Fase 2.5 lo va a reemplazar por socket.io.
 */
export function useKds(vista: VistaKds = 'mostrador') {
  const esEntregados = vista === 'entregados';
  const esSector = vista !== 'mostrador' && vista !== 'entregados';
  const qs = esEntregados ? '?vista=entregados' : esSector ? `?sector=${vista}` : '';
  return useQuery({
    queryKey: ['kds', 'pedidos', vista],
    queryFn: () => api<{ pedidos: KdsPedido[] }>(`/pedidos/kds${qs}`),
    select: (d) => d.pedidos,
    refetchInterval: esEntregados ? 15_000 : 5_000,
    refetchOnWindowFocus: true,
  });
}

export function useTransicionarItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      pedidoId,
      itemId,
      estado,
    }: {
      pedidoId: string;
      itemId: string;
      estado: 'EN_PREPARACION' | 'LISTO';
    }) =>
      api<{ ok: true }>(`/pedidos/${pedidoId}/items/${itemId}/estado`, {
        method: 'PATCH',
        body: { estado },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kds', 'pedidos'] });
    },
  });
}

export function useTransicionarComboOpcion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      pedidoId,
      comboOpcionId,
      estado,
    }: {
      pedidoId: string;
      comboOpcionId: string;
      estado: 'EN_PREPARACION' | 'LISTO';
    }) =>
      api<{ ok: true }>(`/pedidos/${pedidoId}/combo-opciones/${comboOpcionId}/estado`, {
        method: 'PATCH',
        body: { estado },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kds', 'pedidos'] });
    },
  });
}

/** Mostrador cierra el pedido cuando ya se lo dio al cliente. */
export function useEntregarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pedidoId: string) =>
      api<{ pedido: { id: string } }>(`/pedidos/${pedidoId}/entregar`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kds', 'pedidos'] });
    },
  });
}

/** Recall: deshace una entrega y devuelve el pedido a Mostrador. */
export function useReabrirPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pedidoId: string) =>
      api<{ pedido: { id: string } }>(`/pedidos/${pedidoId}/reabrir`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kds', 'pedidos'] });
    },
  });
}

export function useTransicionarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pedidoId, estado }: { pedidoId: string; estado: EstadoPedido }) =>
      api<{ pedido: { id: string; estado: EstadoPedido } }>(`/pedidos/${pedidoId}/estado`, {
        method: 'PATCH',
        body: { estado },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kds', 'pedidos'] });
    },
  });
}
