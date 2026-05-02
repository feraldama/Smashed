import { create } from 'zustand';

export interface CartItemModificador {
  modificadorOpcionId: string;
  nombre: string;
  precioExtra: number;
}

export interface CartItemComboOpcion {
  comboGrupoId: string;
  comboGrupoNombre: string;
  comboGrupoOpcionId: string;
  productoNombre: string;
  precioExtra: number;
}

export interface CartItem {
  /** ID local sólo para distinguir items en el carrito (no se manda al API). */
  localId: string;
  productoVentaId: string;
  // Snapshot para UI
  nombre: string;
  imagenUrl: string | null;
  precioBase: number; // precio del producto antes de modificadores/combo
  precioExtraCombo: number; // suma de precioExtra de opciones del combo
  precioModificadores: number; // suma de precioExtra de modificadores
  cantidad: number;
  observaciones: string | null;
  modificadores: CartItemModificador[];
  combosOpcion: CartItemComboOpcion[];
  esCombo: boolean;
}

export type TipoPedido = 'MOSTRADOR' | 'MESA' | 'DELIVERY_PROPIO' | 'RETIRO_LOCAL';

export interface CartMetadata {
  tipo: TipoPedido;
  // Para MESA
  mesaId: string | null;
  mesaLabel: string | null; // "Mesa 5 · Salón"
  // Para DELIVERY_PROPIO y RETIRO_LOCAL
  clienteId: string | null;
  clienteNombre: string | null;
  // Para DELIVERY_PROPIO
  direccionEntregaId: string | null;
  direccionLabel: string | null;
  observaciones: string | null;
}

const META_INICIAL: CartMetadata = {
  tipo: 'MOSTRADOR',
  mesaId: null,
  mesaLabel: null,
  clienteId: null,
  clienteNombre: null,
  direccionEntregaId: null,
  direccionLabel: null,
  observaciones: null,
};

interface CartState {
  items: CartItem[];
  meta: CartMetadata;
  agregar: (item: Omit<CartItem, 'localId'>) => void;
  cambiarCantidad: (localId: string, delta: number) => void;
  eliminar: (localId: string) => void;
  setMeta: (patch: Partial<CartMetadata>) => void;
  clear: () => void;
}

const newId = () => `it_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const useCartStore = create<CartState>((set) => ({
  items: [],
  meta: { ...META_INICIAL },
  agregar: (item) =>
    set((s) => ({
      items: [...s.items, { ...item, localId: newId() }],
    })),
  cambiarCantidad: (localId, delta) =>
    set((s) => ({
      items: s.items
        .map((it) => (it.localId === localId ? { ...it, cantidad: it.cantidad + delta } : it))
        .filter((it) => it.cantidad > 0),
    })),
  eliminar: (localId) => set((s) => ({ items: s.items.filter((it) => it.localId !== localId) })),
  setMeta: (patch) => set((s) => ({ meta: { ...s.meta, ...patch } })),
  clear: () => set({ items: [], meta: { ...META_INICIAL } }),
}));

/** Calcula el total de un item del carrito (precio unitario × cantidad). */
export function totalItem(it: CartItem): number {
  return (it.precioBase + it.precioExtraCombo + it.precioModificadores) * it.cantidad;
}

export function totalCarrito(items: CartItem[]): number {
  return items.reduce((acc, it) => acc + totalItem(it), 0);
}
