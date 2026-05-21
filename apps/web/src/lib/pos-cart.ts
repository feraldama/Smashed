import { productoImagenSrc, type ProductoListado } from '@/hooks/useCatalogo';

/**
 * Carrito del POS — estado local con reducer puro.
 *
 * Cada línea del carrito es un "ItemCarrito" con su propio config de modificadores
 * y combo (si aplica). Dos líneas con el mismo productoVentaId pero distintos
 * modificadores son items separados (no se fusionan), así el cajero puede tener
 * "smash con queso x1" y "smash sin pickles x1" distinguidos.
 *
 * El precio efectivo de la línea es:
 *   (precio del producto + precioExtra de cada combo elegido + precioExtra de cada modificador) × cantidad
 *
 * El carrito sólo trabaja con guaraníes enteros (BigInt → number safe acá porque
 * los precios reales no pasan los Number.MAX_SAFE_INTEGER en POS típico).
 */

export interface ItemCarritoModificador {
  modificadorGrupoId: string;
  modificadorOpcionId: string;
  nombre: string;
  precioExtra: number;
  /** Si el modificador aplica a un componente específico de un combo
   * (ej: "sin cebolla" para la hamburguesa elegida del combo, no al item global). */
  comboGrupoId?: string;
  /** Nombre del componente del combo, sólo para UI (ticket, carrito). */
  comboGrupoNombre?: string;
}

export interface ItemCarritoCombo {
  comboGrupoId: string;
  comboGrupoOpcionId: string;
  grupoNombre: string;
  opcionNombre: string;
  precioExtra: number;
}

export interface ItemCarrito {
  /** ID local del item dentro del carrito (no relacionado a BD). */
  lineId: string;
  productoVentaId: string;
  codigo: string | null;
  nombre: string;
  imagenUrl: string | null;
  precioUnitario: number;
  cantidad: number;
  observaciones?: string;
  modificadores: ItemCarritoModificador[];
  combosOpcion: ItemCarritoCombo[];
  /** Si el item se cargó desde una promo: id de la promo + nombre para UI. */
  promocionId?: string;
  promocionNombre?: string;
  /** Si la promo es NXM (lleva N paga M), guardamos lleva/paga para calcular
   *  las unidades gratis al cambiar la cantidad en el carrito. Para los demás
   *  tipos queda en undefined y el precioUnitario ya viene con la promo. */
  promocionNxm?: { lleva: number; paga: number };
}

export interface CartState {
  items: ItemCarrito[];
}

export type CartAction =
  | { type: 'ADD'; item: Omit<ItemCarrito, 'lineId' | 'cantidad'> & { cantidad?: number } }
  | { type: 'INC'; lineId: string }
  | { type: 'DEC'; lineId: string }
  | { type: 'SET_QTY'; lineId: string; cantidad: number }
  | {
      type: 'REPLACE';
      lineId: string;
      item: Omit<ItemCarrito, 'lineId' | 'cantidad'> & { cantidad?: number };
    }
  | { type: 'REMOVE'; lineId: string }
  | { type: 'CLEAR' };

export const cartInitial: CartState = { items: [] };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD': {
      const lineId = `${action.item.productoVentaId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const item: ItemCarrito = {
        lineId,
        ...action.item,
        cantidad: action.item.cantidad ?? 1,
      };
      return { items: [...state.items, item] };
    }
    case 'INC':
      return {
        items: state.items.map((it) =>
          it.lineId === action.lineId ? { ...it, cantidad: it.cantidad + 1 } : it,
        ),
      };
    case 'DEC':
      return {
        items: state.items
          .map((it) => (it.lineId === action.lineId ? { ...it, cantidad: it.cantidad - 1 } : it))
          .filter((it) => it.cantidad > 0),
      };
    case 'SET_QTY':
      return {
        items: state.items
          .map((it) =>
            it.lineId === action.lineId ? { ...it, cantidad: Math.max(0, action.cantidad) } : it,
          )
          .filter((it) => it.cantidad > 0),
      };
    case 'REPLACE':
      return {
        items: state.items.map((it) =>
          it.lineId === action.lineId
            ? { ...action.item, lineId: it.lineId, cantidad: action.item.cantidad ?? it.cantidad }
            : it,
        ),
      };
    case 'REMOVE':
      return { items: state.items.filter((it) => it.lineId !== action.lineId) };
    case 'CLEAR':
      return cartInitial;
  }
}

// ───── Cálculos ─────

export function precioLinea(it: ItemCarrito): number {
  const extras =
    it.modificadores.reduce((acc, m) => acc + m.precioExtra, 0) +
    it.combosOpcion.reduce((acc, c) => acc + c.precioExtra, 0);
  const unitario = it.precioUnitario + extras;
  if (it.promocionNxm) {
    const { lleva, paga } = it.promocionNxm;
    const gratis = Math.floor(it.cantidad / lleva) * (lleva - paga);
    return unitario * (it.cantidad - gratis);
  }
  return unitario * it.cantidad;
}

/**
 * Unidades "gratis" en una línea NXM dada la cantidad actual. Devuelve 0 para
 * items que no son NXM. Útil para mostrar el ahorro en el ticket/carrito.
 */
export function unidadesGratisNxm(it: ItemCarrito): number {
  if (!it.promocionNxm) return 0;
  const { lleva, paga } = it.promocionNxm;
  return Math.floor(it.cantidad / lleva) * (lleva - paga);
}

export function totalCarrito(state: CartState): number {
  return state.items.reduce((acc, it) => acc + precioLinea(it), 0);
}

export function cantidadTotal(state: CartState): number {
  return state.items.reduce((acc, it) => acc + it.cantidad, 0);
}

/**
 * Calcula el recargo de delivery a aplicar — mirror exacto del cálculo
 * backend en `pedido.service.calcularRecargoDelivery`. El backend es la
 * autoridad final (el frontend solo previsualiza al cajero para que no haya
 * sorpresas al confirmar). Si los dos divergen, el monto persistido es el
 * del backend.
 *
 *  - Solo aplica si `tipoPedido === 'DELIVERY_PROPIO'`.
 *  - Si la sucursal no tiene config activa o valor=0, devuelve 0.
 *  - Si el cliente está exento, devuelve 0.
 *  - MONTO: valor en Gs.
 *  - PORCENTAJE: valor en centésimos del 1% (10000 = 100%) aplicado al
 *    total bruto (subtotal + IVA).
 */
export function calcularRecargoDelivery(opts: {
  tipoPedido: string;
  totalConIva: number;
  config: { activo: boolean; tipo: 'PORCENTAJE' | 'MONTO'; valor: number } | null | undefined;
  clienteExento: boolean;
}): number {
  if (opts.tipoPedido !== 'DELIVERY_PROPIO') return 0;
  if (!opts.config || !opts.config.activo || opts.config.valor <= 0) return 0;
  if (opts.clienteExento) return 0;
  if (opts.config.tipo === 'MONTO') return opts.config.valor;
  return Math.floor((opts.totalConIva * opts.config.valor) / 10000);
}

// ───── Conversión al payload del API ─────

export function aPayloadPedidoItems(state: CartState) {
  return state.items.map((it) => ({
    productoVentaId: it.productoVentaId,
    cantidad: it.cantidad,
    observaciones: it.observaciones,
    modificadores: it.modificadores.map((m) => ({
      modificadorOpcionId: m.modificadorOpcionId,
      ...(m.comboGrupoId ? { comboGrupoId: m.comboGrupoId } : {}),
    })),
    combosOpcion: it.combosOpcion.map((c) => ({
      comboGrupoId: c.comboGrupoId,
      comboGrupoOpcionId: c.comboGrupoOpcionId,
    })),
    ...(it.promocionId ? { promocionId: it.promocionId } : {}),
  }));
}

// ───── Helper de creación desde producto ─────

export function itemDesdeProductoSimple(
  p: ProductoListado,
): Omit<ItemCarrito, 'lineId' | 'cantidad'> {
  return {
    productoVentaId: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    imagenUrl: productoImagenSrc(p),
    precioUnitario: Number(p.precio),
    modificadores: [],
    combosOpcion: [],
  };
}

/**
 * Crea un item del carrito desde un producto vinculado a una promo, con el
 * precio promocional ya calculado en el cliente (preview UX). El backend es la
 * autoridad — vuelve a calcular al crear el pedido y rechaza si la promo dejó
 * de estar vigente.
 */
export function itemDesdeProductoEnPromo(
  p: ProductoListado,
  promo: {
    id: string;
    nombre: string;
    tipo: string;
    precioFijo: string | null;
    porcentaje: number | null;
    nxmLleva: number | null;
    nxmPaga: number | null;
  },
): Omit<ItemCarrito, 'lineId' | 'cantidad'> {
  const precioBase = Number(p.precio);
  let precio = precioBase;
  let promocionNxm: { lleva: number; paga: number } | undefined;
  if (promo.tipo === 'PRECIO_FIJO' && promo.precioFijo != null) {
    precio = Number(promo.precioFijo);
  } else if (promo.tipo === 'PORCENTAJE' && promo.porcentaje != null) {
    const descuento = Math.floor((precioBase * promo.porcentaje) / 10000);
    precio = precioBase - descuento;
  } else if (promo.tipo === 'NXM' && promo.nxmLleva != null && promo.nxmPaga != null) {
    // En NXM `precioUnitario` queda en el precio base; el descuento sale por
    // unidades gratis al recalcular `precioLinea`.
    promocionNxm = { lleva: promo.nxmLleva, paga: promo.nxmPaga };
  }
  return {
    productoVentaId: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    imagenUrl: productoImagenSrc(p),
    precioUnitario: precio,
    modificadores: [],
    combosOpcion: [],
    promocionId: promo.id,
    promocionNombre: promo.nombre,
    promocionNxm,
  };
}
