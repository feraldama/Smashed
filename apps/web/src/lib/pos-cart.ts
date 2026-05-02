import type { ProductoListado } from '@/hooks/useCatalogo';

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
}

export interface CartState {
  items: ItemCarrito[];
}

export type CartAction =
  | { type: 'ADD'; item: Omit<ItemCarrito, 'lineId' | 'cantidad'> & { cantidad?: number } }
  | { type: 'INC'; lineId: string }
  | { type: 'DEC'; lineId: string }
  | { type: 'SET_QTY'; lineId: string; cantidad: number }
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
  return (it.precioUnitario + extras) * it.cantidad;
}

export function totalCarrito(state: CartState): number {
  return state.items.reduce((acc, it) => acc + precioLinea(it), 0);
}

export function cantidadTotal(state: CartState): number {
  return state.items.reduce((acc, it) => acc + it.cantidad, 0);
}

// ───── Conversión al payload del API ─────

export function aPayloadPedidoItems(state: CartState) {
  return state.items.map((it) => ({
    productoVentaId: it.productoVentaId,
    cantidad: it.cantidad,
    observaciones: it.observaciones,
    modificadores: it.modificadores.map((m) => ({ modificadorOpcionId: m.modificadorOpcionId })),
    combosOpcion: it.combosOpcion.map((c) => ({
      comboGrupoId: c.comboGrupoId,
      comboGrupoOpcionId: c.comboGrupoOpcionId,
    })),
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
    imagenUrl: p.imagenUrl,
    precioUnitario: Number(p.precio),
    modificadores: [],
    combosOpcion: [],
  };
}
