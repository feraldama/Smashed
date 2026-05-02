'use client';

import {
  AlertCircle,
  ChevronLeft,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
  User,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useReducer, useState } from 'react';

import { AuthGate, ROLES_OPERATIVOS } from '@/components/AuthGate';
import { ClienteSelector } from '@/components/pos/ClienteSelector';
import { CobrarModal } from '@/components/pos/CobrarModal';
import { ConfigurarItemModal } from '@/components/pos/ConfigurarItemModal';
import { MesaSelector } from '@/components/pos/MesaSelector';
import { ProductoCard } from '@/components/pos/ProductoCard';
import { toast } from '@/components/Toast';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { useMiAperturaActiva } from '@/hooks/useCaja';
import {
  type Categoria,
  useCategorias,
  useProductos,
  type ProductoListado,
} from '@/hooks/useCatalogo';
import { type Cliente } from '@/hooks/useClientes';
import { type Mesa } from '@/hooks/useMesas';
import {
  useAgregarItems,
  useConfirmarPedido,
  useCrearPedido,
  type TipoPedido,
} from '@/hooks/usePedidos';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  aPayloadPedidoItems,
  cantidadTotal,
  cartInitial,
  cartReducer,
  itemDesdeProductoSimple,
  type ItemCarrito,
  precioLinea,
  totalCarrito,
} from '@/lib/pos-cart';
import { cn } from '@/lib/utils';

export default function POSPage() {
  return (
    <AuthGate roles={ROLES_OPERATIVOS}>
      <POSScreen />
    </AuthGate>
  );
}

const ROLES_ADMIN_FE = new Set(['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN']);

function POSScreen() {
  const user = useAuthStore((s) => s.user);
  const esAdmin = user ? ROLES_ADMIN_FE.has(user.rol) : false;
  const { data: apertura, isLoading: cajaLoading } = useMiAperturaActiva();
  const { data: categorias = [] } = useCategorias();
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const { data: productos = [], isLoading: prodLoading } = useProductos({
    categoriaId: categoriaId ?? undefined,
    busqueda: busqueda.trim() || undefined,
  });

  const [cart, dispatch] = useReducer(cartReducer, cartInitial);
  const [configProductoId, setConfigProductoId] = useState<string | null>(null);
  const [editandoItem, setEditandoItem] = useState<ItemCarrito | null>(null);
  const [pedidoConfirmado, setPedidoConfirmado] = useState<{ id: string; total: number } | null>(
    null,
  );
  const [showCobrar, setShowCobrar] = useState(false);

  // Modo de venta + selección
  const [tipo, setTipo] = useState<TipoPedido>('MOSTRADOR');
  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [showMesaSel, setShowMesaSel] = useState(false);
  const [showClienteSel, setShowClienteSel] = useState(false);

  const crearPedido = useCrearPedido();
  const confirmarPedido = useConfirmarPedido();
  const agregarItems = useAgregarItems();
  const router = useRouter();

  // Si la mesa elegida está OCUPADA, hay un pedido abierto que vamos a extender.
  const pedidoExistenteId = mesa?.estado === 'OCUPADA' ? (mesa.pedidoActivo?.id ?? null) : null;
  const pedidoExistenteNumero =
    mesa?.estado === 'OCUPADA' ? (mesa.pedidoActivo?.numero ?? null) : null;

  const total = useMemo(() => totalCarrito(cart), [cart]);
  const totalItems = useMemo(() => cantidadTotal(cart), [cart]);

  if (cajaLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Guard: necesita caja abierta
  if (!apertura) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md rounded-lg border border-amber-300 bg-amber-50 p-6 text-center dark:bg-amber-950/30">
          <AlertCircle className="mx-auto mb-3 h-10 w-10 text-amber-600 dark:text-amber-400" />
          <h2 className="text-lg font-bold">Necesitás una caja abierta para vender</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El POS requiere un turno activo donde se asocien las ventas y pagos.
          </p>
          <Link
            href="/caja"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            <Wallet className="h-4 w-4" /> Ir a Caja
          </Link>
        </div>
      </div>
    );
  }

  function handleAgregar(p: ProductoListado) {
    // Si tiene combo o si tiene `esCombo`, abrir modal de configuración.
    // Para detectar modificadores se requiere fetch del detalle, así que
    // abrimos el modal siempre que sea combo o cuando el detalle indique grupos.
    // Por ahora: abrir modal si esCombo, sino agregar directo.
    // (El modal se autodetecta y si no hay nada que configurar, se puede confirmar directo.)
    if (p.esCombo) {
      setConfigProductoId(p.id);
      return;
    }
    // Probamos agregado directo. Si después el backend rechaza por modificadores
    // obligatorios, el usuario verá el error y deberá usar el modal.
    dispatch({ type: 'ADD', item: itemDesdeProductoSimple(p) });
    toast.success(`+ ${p.nombre}`);
  }

  async function handleConfirmarPedido() {
    if (cart.items.length === 0) return;
    if (tipo === 'MESA' && !mesa) {
      toast.error('Seleccioná una mesa primero');
      return;
    }

    // Caso 1: agregar a cuenta abierta (mesa OCUPADA con pedido activo)
    if (pedidoExistenteId) {
      try {
        await agregarItems.mutateAsync({
          pedidoId: pedidoExistenteId,
          items: aPayloadPedidoItems(cart),
        });
        toast.success(`+${cantidadTotal(cart)} ítems a la cuenta de Mesa ${mesa?.numero ?? ''}`);
        dispatch({ type: 'CLEAR' });
        setMesa(null);
        setTipo('MOSTRADOR');
        // No abrimos el modal de cobro — la mesa se cobra desde /entregas cuando esté lista.
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Error al agregar items');
      }
      return;
    }

    // Caso 2: pedido nuevo
    try {
      const created = await crearPedido.mutateAsync({
        tipo,
        items: aPayloadPedidoItems(cart),
        clienteId: cliente?.id,
        mesaId: tipo === 'MESA' ? mesa?.id : undefined,
      });
      // Confirmar inmediatamente (descuenta stock). Si falla por stock, queda PENDIENTE
      // y el pedido se puede atender desde otra pantalla.
      try {
        await confirmarPedido.mutateAsync(created.pedido.id);
      } catch (err) {
        toast.error(
          err instanceof ApiError
            ? `Pedido creado pero confirmación falló: ${err.message}`
            : 'Pedido creado pero confirmación falló — revisá stock',
        );
      }
      // Si es MESA, dejamos la cuenta abierta — no abrimos el modal de cobro,
      // se cobra desde /entregas cuando todo esté entregado.
      if (tipo === 'MESA') {
        toast.success(`Pedido #${created.pedido.numero} enviado a cocina`);
        dispatch({ type: 'CLEAR' });
        setMesa(null);
        setCliente(null);
        setTipo('MOSTRADOR');
        return;
      }
      // MOSTRADOR/DELIVERY: cobrar inmediato
      setPedidoConfirmado({ id: created.pedido.id, total: Number(created.pedido.total) });
      setShowCobrar(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al crear pedido');
    }
  }

  function handleCobrarSuccess(comprobanteId: string) {
    dispatch({ type: 'CLEAR' });
    setPedidoConfirmado(null);
    setShowCobrar(false);
    setMesa(null);
    setCliente(null);
    setTipo('MOSTRADOR');
    // Abrir impresión en nueva tab
    window.open(`/comprobantes/${comprobanteId}/imprimir`, '_blank');
    router.refresh();
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Mini header POS */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
        {esAdmin && (
          <>
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Admin
            </Link>
            <div className="h-6 w-px bg-border" />
          </>
        )}
        <p className="text-sm font-bold">
          POS <span className="font-normal text-muted-foreground">· {apertura.caja.nombre}</span>
        </p>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {user?.nombreCompleto}
          </span>
          <LogoutButton />
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Productos */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header con search */}
          <div className="flex flex-wrap items-center gap-2 border-b bg-card px-4 py-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto…"
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">{productos.length} productos</p>
          </div>

          {/* Categorías */}
          <CategoriasTabs
            categorias={categorias}
            activa={categoriaId}
            onSeleccionar={setCategoriaId}
          />

          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {prodLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : productos.length === 0 ? (
              <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                No hay productos en esta categoría
              </div>
            ) : (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
                {productos
                  .filter((p) => p.esVendible)
                  .map((p) => (
                    <ProductoCard key={p.id} producto={p} onClick={handleAgregar} />
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Carrito */}
        <aside className="flex w-full flex-col border-l bg-card lg:w-96">
          <div className="border-b px-4 py-3">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
              <ShoppingCart className="h-4 w-4" /> Carrito
              {totalItems > 0 && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
                  {totalItems}
                </span>
              )}
            </h2>

            {/* Toggle modo */}
            <div className="mb-2 inline-flex w-full overflow-hidden rounded-md border">
              <ModoBtn
                active={tipo === 'MOSTRADOR'}
                icon={<Store className="h-3.5 w-3.5" />}
                label="Mostrador"
                onClick={() => {
                  setTipo('MOSTRADOR');
                  setMesa(null);
                }}
              />
              <ModoBtn
                active={tipo === 'MESA'}
                icon={<Utensils className="h-3.5 w-3.5" />}
                label="Mesa"
                onClick={() => setTipo('MESA')}
              />
              <ModoBtn
                active={tipo === 'DELIVERY'}
                icon={<Truck className="h-3.5 w-3.5" />}
                label="Delivery"
                onClick={() => setTipo('DELIVERY')}
              />
            </div>

            {/* Selección contextual */}
            {tipo === 'MESA' && (
              <>
                <button
                  type="button"
                  onClick={() => setShowMesaSel(true)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border p-2 text-sm',
                    mesa
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-amber-300 bg-amber-50 dark:bg-amber-950/30',
                  )}
                >
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">
                    {mesa ? `Mesa ${mesa.numero} (cap. ${mesa.capacidad})` : 'Elegir mesa…'}
                  </span>
                  <span className="text-xs font-medium text-primary">
                    {mesa ? 'Cambiar' : 'Elegir'}
                  </span>
                </button>
                {pedidoExistenteId && (
                  <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:bg-amber-950/30 dark:text-amber-200">
                    <p className="font-bold">Cuenta abierta · Pedido #{pedidoExistenteNumero}</p>
                    <p className="text-muted-foreground">
                      Lo que agregues se suma a esta cuenta. Se cobra desde Entregas cuando esté
                      lista.
                    </p>
                  </div>
                )}
              </>
            )}

            {(tipo === 'DELIVERY' || tipo === 'MOSTRADOR') && (
              <button
                type="button"
                onClick={() => setShowClienteSel(true)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border p-2 text-sm',
                  cliente && !cliente.esConsumidorFinal
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-input',
                )}
              >
                <User className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-left">
                  {cliente ? cliente.razonSocial : 'Cons. final (sin cliente)'}
                </span>
                <span className="text-xs font-medium text-primary">
                  {cliente ? 'Cambiar' : 'Elegir'}
                </span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {cart.items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                <ShoppingCart className="h-10 w-10 opacity-30" />
                <p>Carrito vacío</p>
                <p className="text-xs">Tocá un producto para agregarlo</p>
              </div>
            ) : (
              <ul className="divide-y">
                {cart.items.map((it) => (
                  <CartItemRow
                    key={it.lineId}
                    item={it}
                    onInc={() => dispatch({ type: 'INC', lineId: it.lineId })}
                    onDec={() => dispatch({ type: 'DEC', lineId: it.lineId })}
                    onRemove={() => dispatch({ type: 'REMOVE', lineId: it.lineId })}
                    onEdit={() => setEditandoItem(it)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="space-y-3 border-t bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Total</span>
              <span className="text-2xl font-bold tabular-nums">
                Gs. {total.toLocaleString('es-PY')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleConfirmarPedido();
              }}
              disabled={
                cart.items.length === 0 ||
                crearPedido.isPending ||
                agregarItems.isPending ||
                (tipo === 'MESA' && !mesa)
              }
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-base font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              {crearPedido.isPending || agregarItems.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : pedidoExistenteId ? (
                <>
                  <Plus className="h-5 w-5" /> Agregar a Mesa {mesa?.numero} (#
                  {pedidoExistenteNumero})
                </>
              ) : tipo === 'MESA' ? (
                <>
                  <Utensils className="h-5 w-5" /> Enviar a cocina
                </>
              ) : (
                <>
                  <Wallet className="h-5 w-5" /> Cobrar
                </>
              )}
            </button>
            {cart.items.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('¿Vaciar el carrito?')) dispatch({ type: 'CLEAR' });
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                <Trash2 className="h-3 w-3" /> Vaciar carrito
              </button>
            )}
          </div>
        </aside>

        {/* Modales */}
        {configProductoId && (
          <ConfigurarItemModal
            productoId={configProductoId}
            onCancel={() => setConfigProductoId(null)}
            onConfirm={(item) => {
              dispatch({ type: 'ADD', item });
              setConfigProductoId(null);
              toast.success(`+ ${item.nombre}`);
            }}
          />
        )}
        {editandoItem && (
          <ConfigurarItemModal
            productoId={editandoItem.productoVentaId}
            initialItem={editandoItem}
            onCancel={() => setEditandoItem(null)}
            onConfirm={(item) => {
              dispatch({ type: 'REPLACE', lineId: editandoItem.lineId, item });
              setEditandoItem(null);
              toast.success(`${item.nombre} actualizado`);
            }}
          />
        )}
        {showCobrar && pedidoConfirmado && (
          <CobrarModal
            pedidoId={pedidoConfirmado.id}
            total={pedidoConfirmado.total}
            clienteInicial={cliente}
            onCancel={() => setShowCobrar(false)}
            onSuccess={handleCobrarSuccess}
          />
        )}
        {showMesaSel && (
          <MesaSelector
            mesaSeleccionadaId={mesa?.id ?? null}
            onSeleccionar={(m) => {
              setMesa(m);
              setShowMesaSel(false);
            }}
            onClose={() => setShowMesaSel(false)}
          />
        )}
        {showClienteSel && (
          <ClienteSelector
            clienteSeleccionadoId={cliente?.id ?? null}
            onSeleccionar={(c) => {
              // Si elige consumidor final, lo dejamos como null (el backend lo resuelve)
              setCliente(c?.esConsumidorFinal ? null : c);
              setShowClienteSel(false);
            }}
            onClose={() => setShowClienteSel(false)}
          />
        )}
      </div>
    </div>
  );
}

function ModoBtn({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-card text-muted-foreground hover:bg-accent',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function CategoriasTabs({
  categorias,
  activa,
  onSeleccionar,
}: {
  categorias: Categoria[];
  activa: string | null;
  onSeleccionar: (id: string | null) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b bg-background px-4 py-2">
      <button
        type="button"
        onClick={() => onSeleccionar(null)}
        className={cn(
          'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium',
          activa === null
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent',
        )}
      >
        Todas
      </button>
      {categorias.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSeleccionar(c.id)}
          className={cn(
            'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium',
            activa === c.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent',
          )}
        >
          {c.nombre}
          <span className="ml-1.5 text-xs opacity-70">({c.totalProductos})</span>
        </button>
      ))}
    </div>
  );
}

function CartItemRow({
  item,
  onInc,
  onDec,
  onRemove,
  onEdit,
}: {
  item: ItemCarrito;
  onInc: () => void;
  onDec: () => void;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const subtotal = precioLinea(item);
  // El item es editable si tiene algo configurable: combo, modificadores u observaciones.
  // Para un producto simple sin nada de eso, los botones +/-/x ya alcanzan.
  const editable =
    item.combosOpcion.length > 0 || item.modificadores.length > 0 || Boolean(item.observaciones);
  return (
    <li className="p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            {editable ? (
              <button
                type="button"
                onClick={onEdit}
                className="flex-1 cursor-pointer rounded-sm text-left hover:bg-accent/40"
                aria-label={`Editar ${item.nombre}`}
              >
                <p className="line-clamp-2 text-sm font-semibold">{item.nombre}</p>
                {item.combosOpcion.length > 0 && (
                  <ul className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.combosOpcion.map((c) => (
                      <li key={c.comboGrupoOpcionId}>
                        · {c.grupoNombre}: {c.opcionNombre}
                      </li>
                    ))}
                  </ul>
                )}
                {item.modificadores.length > 0 && (
                  <ul className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.modificadores.map((m) => (
                      <li key={m.modificadorOpcionId}>+ {m.nombre}</li>
                    ))}
                  </ul>
                )}
                {item.observaciones && (
                  <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                    · {item.observaciones}
                  </p>
                )}
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-primary/70">
                  Tocá para editar
                </p>
              </button>
            ) : (
              <p className="line-clamp-2 flex-1 text-sm font-semibold">{item.nombre}</p>
            )}
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Eliminar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDec}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-input hover:bg-accent"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-7 text-center text-sm font-semibold tabular-nums">
                {item.cantidad}
              </span>
              <button
                type="button"
                onClick={onInc}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-input hover:bg-accent"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <span className="text-sm font-bold tabular-nums">
              Gs. {subtotal.toLocaleString('es-PY')}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
