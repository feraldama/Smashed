'use client';

import {
  AlertCircle,
  ChevronLeft,
  Loader2,
  MapPin,
  Minus,
  PackageCheck,
  Plus,
  Search,
  Receipt,
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

import { AuthGate } from '@/components/AuthGate';
import { ClienteSelector } from '@/components/pos/ClienteSelector';
import { CobrarModal } from '@/components/pos/CobrarModal';
import { ConfigurarItemModal } from '@/components/pos/ConfigurarItemModal';
import { MesaSelector } from '@/components/pos/MesaSelector';
import { ProductoCard } from '@/components/pos/ProductoCard';
import { confirmar, toast } from '@/components/Toast';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { useMiAperturaActiva } from '@/hooks/useCaja';
import {
  type Categoria,
  useCategorias,
  useProductos,
  type ProductoListado,
} from '@/hooks/useCatalogo';
import { type Cliente } from '@/hooks/useClientes';
import { useKeyboardInput } from '@/hooks/useKeyboardInput';
import { type Mesa } from '@/hooks/useMesas';
import {
  useAgregarItems,
  useConfirmarPedido,
  useCrearPedido,
  type TipoPedido,
} from '@/hooks/usePedidos';
import { type Promocion, usePromocionesVigentes } from '@/hooks/usePromociones';
import { useSucursal } from '@/hooks/useSucursales';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { imprimirComprobante } from '@/lib/imprimir';
import {
  aPayloadPedidoItems,
  calcularRecargoDelivery,
  cantidadTotal,
  cartInitial,
  cartReducer,
  itemDesdeProductoEnPromo,
  itemDesdeProductoSimple,
  type ItemCarrito,
  precioLinea,
  totalCarrito,
  unidadesGratisNxm,
} from '@/lib/pos-cart';
import { cn } from '@/lib/utils';

export default function POSPage() {
  return (
    <AuthGate>
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
  const { data: promociones = [] } = usePromocionesVigentes(user?.sucursalActivaId ?? null);
  // Selección de pestaña: o una categoría real (`categoriaId`) o una promo
  // (`promocionId`). Son mutuamente excluyentes — al elegir una se limpia la otra.
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [promocionId, setPromocionId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const busquedaKb = useKeyboardInput({
    value: busqueda,
    onChange: setBusqueda,
    label: 'Buscar producto',
    maxLength: 60,
  });

  const { data: productos = [], isLoading: prodLoading } = useProductos({
    categoriaId: categoriaId ?? undefined,
    busqueda: busqueda.trim() || undefined,
  });

  // Promo seleccionada (si hay) — siempre que aún esté vigente.
  const promoActiva = useMemo(
    () => (promocionId ? (promociones.find((p) => p.id === promocionId) ?? null) : null),
    [promocionId, promociones],
  );
  // Si seleccionaron una promo, el grid muestra solo los productos vinculados
  // a la promo. El catálogo se filtra cliente-side a partir de `productos`.
  const productosEnPromo = useMemo(() => {
    if (!promoActiva) return null;
    const idsPromo = new Set(promoActiva.productos.map((p) => p.productoVentaId));
    return productos.filter((p) => idsPromo.has(p.id));
  }, [promoActiva, productos]);
  const productosVisibles = productosEnPromo ?? productos;

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

  // Config de recargo delivery de la sucursal activa (solo importa cuando tipo=DELIVERY).
  // Se ignora silenciosamente si el endpoint todavía no terminó — el backend igualmente
  // aplica el recargo al crear; esto es solo previsualización para el cajero.
  const { data: sucursalActiva } = useSucursal(user?.sucursalActivaId ?? null);
  const recargoDelivery = useMemo(
    () =>
      calcularRecargoDelivery({
        tipoPedido: tipo,
        totalConIva: total,
        config: sucursalActiva
          ? {
              activo: sucursalActiva.deliveryRecargoActivo,
              tipo: sucursalActiva.deliveryRecargoTipo,
              valor: Number.parseInt(sucursalActiva.deliveryRecargoValor, 10),
            }
          : null,
        clienteExento: cliente?.sinRecargoDelivery ?? false,
      }),
    [tipo, total, sucursalActiva, cliente],
  );
  const totalConRecargo = total + recargoDelivery;
  const recargoSucursalActivo = Boolean(
    sucursalActiva?.deliveryRecargoActivo &&
    Number.parseInt(sucursalActiva.deliveryRecargoValor, 10) > 0,
  );

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
    // Combos y productos con modificadores vinculados requieren elegir opciones,
    // así que se abre el modal de configuración antes de añadir al carrito.
    // Si hay promo activa, el modal sigue funcionando — la promo se inyecta al
    // confirmar (ver handleConfirmConfigurarItem en CartArea).
    if (p.esCombo || p.tieneModificadores) {
      setConfigProductoId(p.id);
      return;
    }
    if (promoActiva) {
      dispatch({ type: 'ADD', item: itemDesdeProductoEnPromo(p, promoActiva) });
      toast.success(`+ ${p.nombre} (promo)`);
      return;
    }
    dispatch({ type: 'ADD', item: itemDesdeProductoSimple(p) });
    toast.success(`+ ${p.nombre}`);
  }

  /**
   * Carga todos los productos de una promo tipo COMBO al carrito (uno por
   * producto con su cantidadMin). El backend ya prorratea precioFijo entre
   * los items al recibirlos, así que acá pasamos el precio base y dejamos
   * que el backend recalcule. Para preview en UI mostramos el precioFijo
   * dividido por la cantidad total (aproximado).
   */
  function handleCargarCombo() {
    if (!promoActiva || promoActiva.tipo !== 'COMBO') return;
    const productosCombo = promoActiva.productos
      .map((pp) => ({
        prod: productos.find((p) => p.id === pp.productoVentaId),
        cantidadMin: pp.cantidadMin,
      }))
      .filter((x): x is { prod: ProductoListado; cantidadMin: number } => Boolean(x.prod));

    if (productosCombo.length !== promoActiva.productos.length) {
      toast.error('Faltan productos del combo en el catálogo activo');
      return;
    }

    // Bloqueamos combos que tienen productos con esCombo o modificadores —
    // requieren configuración por producto y la pseudo-categoría de combo no
    // los soporta todavía.
    if (productosCombo.some((x) => x.prod.esCombo || x.prod.tieneModificadores)) {
      toast.error('Algún producto del combo necesita configuración — no soportado todavía');
      return;
    }

    // Distribuir precioFijo proporcional al precioBase * cantidadMin (espejo
    // del cálculo del backend — el backend re-valida y ajusta si difiere).
    const precioFijo = Number(promoActiva.precioFijo ?? 0);
    const pesos = productosCombo.map((x) => Number(x.prod.precio) * x.cantidadMin);
    const sumaPesos = pesos.reduce((acc, w) => acc + w, 0);
    let acumulado = 0;
    productosCombo.forEach((x, i) => {
      const esUltimo = i === productosCombo.length - 1;
      const peso = pesos[i] ?? 0;
      const asignadoTotal = esUltimo
        ? precioFijo - acumulado
        : Math.floor((precioFijo * peso) / sumaPesos);
      acumulado += asignadoTotal;
      const precioUnit = Math.floor(asignadoTotal / x.cantidadMin);
      dispatch({
        type: 'ADD',
        item: {
          productoVentaId: x.prod.id,
          codigo: x.prod.codigo,
          nombre: x.prod.nombre,
          imagenUrl: null,
          precioUnitario: precioUnit,
          cantidad: x.cantidadMin,
          modificadores: [],
          combosOpcion: [],
          promocionId: promoActiva.id,
          promocionNombre: promoActiva.nombre,
        },
      });
    });
    toast.success(`+ ${promoActiva.nombre}`);
  }

  /**
   * Confirma el pedido y decide qué pasa según tipo + opción:
   *
   *  - MOSTRADOR (fast-food): crea PENDIENTE → abre modal cobro. La emisión del
   *    comprobante confirma + manda a cocina + descuenta stock.
   *
   *  - MESA: crea + confirma (cocina ya prepara) → NO abre cobro. Se cobra
   *    desde /entregas cuando la mesa terminó.
   *
   *  - DELIVERY_PROPIO con `cobroInmediato=true` (prepago): igual a MOSTRADOR.
   *    Útil para clientes que pagan al hacer el pedido (web/app/tarjeta).
   *
   *  - DELIVERY_PROPIO con `cobroInmediato=false` (pago contra entrega): igual
   *    a MESA. Cocina prepara, repartidor sale, cobro al volver desde /entregas.
   */
  async function handleConfirmarPedido(opts: { cobroInmediato?: boolean } = {}) {
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

      // ¿Hay que confirmar (mandar a cocina) ahora? Sí para MESA y para
      // DELIVERY con cobro contra entrega. NO para MOSTRADOR ni para DELIVERY
      // con cobro inmediato — en esos casos la confirmación ocurre dentro de
      // la emisión del comprobante.
      const confirmaAhora = tipo === 'MESA' || (tipo === 'DELIVERY_PROPIO' && !opts.cobroInmediato);

      if (confirmaAhora) {
        try {
          await confirmarPedido.mutateAsync(created.pedido.id);
        } catch (err) {
          toast.error(
            err instanceof ApiError
              ? `Pedido creado pero confirmación falló: ${err.message}`
              : 'Pedido creado pero confirmación falló — revisá stock',
          );
        }
      }

      // ¿Abrir el modal de cobro acá? Sí para MOSTRADOR y DELIVERY con cobro
      // inmediato. Para MESA y DELIVERY contra entrega el cobro va a /entregas.
      const cobrarAhora =
        tipo === 'MOSTRADOR' || (tipo === 'DELIVERY_PROPIO' && opts.cobroInmediato === true);

      if (!cobrarAhora) {
        toast.success(`Pedido #${created.pedido.numero} enviado a cocina`);
        dispatch({ type: 'CLEAR' });
        setMesa(null);
        setCliente(null);
        setTipo('MOSTRADOR');
        return;
      }

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
    // Imprimir directo en un iframe oculto: no saca al cajero del POS ni abre
    // otra pestaña con el diálogo de impresión.
    imprimirComprobante(comprobanteId);
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
          <Link
            href="/entregas"
            className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
            title="Ir a entregas (cobrar pedidos listos, mesa/delivery)"
          >
            <PackageCheck className="h-3.5 w-3.5" />
            Entregas
          </Link>
          <Link
            href="/caja"
            className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
            title="Ir a caja (cerrar turno, ver movimientos)"
          >
            <Wallet className="h-3.5 w-3.5" />
            Caja
          </Link>
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
                {...busquedaKb.inputProps}
              />
            </div>
            <p className="text-xs text-muted-foreground">{productos.length} productos</p>
          </div>

          {/* Categorías + pseudo-categorías de promociones vigentes */}
          <CategoriasTabs
            categorias={categorias}
            promociones={promociones}
            categoriaActiva={categoriaId}
            promocionActiva={promocionId}
            onSeleccionarCategoria={(id) => {
              setPromocionId(null);
              setCategoriaId(id);
            }}
            onSeleccionarPromocion={(id) => {
              setCategoriaId(null);
              setPromocionId(id);
            }}
          />

          {/* Banner contextual cuando hay promo activa */}
          {promoActiva && (
            <div className="border-b bg-primary/5 px-4 py-2 text-xs text-primary">
              <strong>
                {promoActiva.iconoEmoji ?? '✨'} {promoActiva.nombre}
              </strong>
              {promoActiva.tipo === 'PRECIO_FIJO' && promoActiva.precioFijo
                ? ` — precio promocional Gs. ${Number(promoActiva.precioFijo).toLocaleString('es-PY')}`
                : promoActiva.tipo === 'PORCENTAJE' && promoActiva.porcentaje != null
                  ? ` — ${(promoActiva.porcentaje / 100).toFixed(0)}% off`
                  : promoActiva.tipo === 'NXM' && promoActiva.nxmLleva && promoActiva.nxmPaga
                    ? ` — lleva ${promoActiva.nxmLleva} paga ${promoActiva.nxmPaga}`
                    : promoActiva.tipo === 'COMBO' && promoActiva.precioFijo
                      ? ` — combo Gs. ${Number(promoActiva.precioFijo).toLocaleString('es-PY')}`
                      : ''}
            </div>
          )}

          {/* Grid (o tarjeta COMBO si la promo activa es tipo COMBO) */}
          <div className="flex-1 overflow-y-auto p-4">
            {prodLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : promoActiva?.tipo === 'COMBO' ? (
              <ComboCard promo={promoActiva} productos={productos} onCargar={handleCargarCombo} />
            ) : productosVisibles.length === 0 ? (
              <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                {promoActiva
                  ? 'Esta promoción no tiene productos disponibles ahora'
                  : 'No hay productos en esta categoría'}
              </div>
            ) : (
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
                {productosVisibles
                  .filter((p) => p.esVendible)
                  .map((p) => {
                    const itemPreview = promoActiva
                      ? itemDesdeProductoEnPromo(p, promoActiva)
                      : null;
                    const badge =
                      promoActiva?.tipo === 'NXM' && promoActiva.nxmLleva && promoActiva.nxmPaga
                        ? `${promoActiva.nxmLleva}x${promoActiva.nxmPaga}`
                        : undefined;
                    return (
                      <ProductoCard
                        key={p.id}
                        producto={p}
                        precioOverride={itemPreview?.precioUnitario}
                        badgePromo={badge}
                        onClick={handleAgregar}
                      />
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Carrito */}
        <aside className="flex w-full flex-col border-l bg-card lg:w-96">
          <div className="border-b px-4 py-3">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
              <Receipt className="h-4 w-4" /> Pedido
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
                active={tipo === 'DELIVERY_PROPIO'}
                icon={<Truck className="h-3.5 w-3.5" />}
                label="Delivery"
                onClick={() => setTipo('DELIVERY_PROPIO')}
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

            {(tipo === 'DELIVERY_PROPIO' || tipo === 'MOSTRADOR') && (
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
                <Receipt className="h-10 w-10 opacity-30" />
                <p>Pedido vacío</p>
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
            {tipo === 'DELIVERY_PROPIO' && recargoSucursalActivo ? (
              // Delivery con recargo configurado: mostramos subtotal + recargo + total.
              // El recargo NO es editable — sale automático de la config de la sucursal
              // (admin) y se confirma del lado backend al crear el pedido.
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">Gs. {total.toLocaleString('es-PY')}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Truck className="h-3.5 w-3.5" />
                    Recargo delivery
                  </span>
                  {cliente?.sinRecargoDelivery ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                      Cliente exento
                    </span>
                  ) : (
                    <span className="tabular-nums font-medium">
                      +Gs. {recargoDelivery.toLocaleString('es-PY')}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-sm font-medium">Total</span>
                  <span className="text-2xl font-bold tabular-nums">
                    Gs. {totalConRecargo.toLocaleString('es-PY')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm">Total</span>
                <span className="text-2xl font-bold tabular-nums">
                  Gs. {total.toLocaleString('es-PY')}
                </span>
              </div>
            )}
            {tipo === 'DELIVERY_PROPIO' && !pedidoExistenteId ? (
              // Delivery: dos botones — el cajero decide si cobra ahora (prepago)
              // o si cobra el repartidor al entregar (pago contra entrega).
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleConfirmarPedido({ cobroInmediato: false });
                  }}
                  disabled={cart.items.length === 0 || crearPedido.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-base font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                  title="Pago contra entrega — el repartidor cobra al entregar"
                >
                  {crearPedido.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Truck className="h-5 w-5" /> Enviar (cobra repartidor)
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleConfirmarPedido({ cobroInmediato: true });
                  }}
                  disabled={cart.items.length === 0 || crearPedido.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-primary bg-card px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
                  title="Cobrar ahora (prepago) — la emisión del comprobante manda el pedido a cocina"
                >
                  <Wallet className="h-4 w-4" /> Cobrar ahora (prepago)
                </button>
              </div>
            ) : (
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
            )}
            {cart.items.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  void confirmar({
                    titulo: 'Vaciar pedido',
                    mensaje: '¿Seguro que querés vaciar el pedido?',
                    destructivo: true,
                    textoConfirmar: 'Vaciar',
                  }).then((ok) => {
                    if (ok) dispatch({ type: 'CLEAR' });
                  });
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                <Trash2 className="h-3 w-3" /> Vaciar pedido
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
              // Si hay promo activa, inyectamos la promo al item: precio
              // unitario promocional + metadata. Modificadores/combo se
              // mantienen tal cual los eligió el cajero. El backend
              // recalcula y rechaza si la promo no aplica al producto.
              let toAdd = item;
              if (promoActiva) {
                const prod = productos.find((p) => p.id === configProductoId);
                if (prod) {
                  const promoFields = itemDesdeProductoEnPromo(prod, promoActiva);
                  toAdd = {
                    ...item,
                    precioUnitario: promoFields.precioUnitario,
                    promocionId: promoFields.promocionId,
                    promocionNombre: promoFields.promocionNombre,
                    promocionNxm: promoFields.promocionNxm,
                    // En NXM aseguramos al menos `lleva` unidades (sin pisar una
                    // cantidad mayor que el cajero haya elegido a propósito).
                    cantidad:
                      promoFields.cantidad != null
                        ? Math.max(item.cantidad, promoFields.cantidad)
                        : item.cantidad,
                  };
                }
              }
              dispatch({ type: 'ADD', item: toAdd });
              setConfigProductoId(null);
              toast.success(`+ ${item.nombre}${promoActiva ? ' (promo)' : ''}`);
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
  promociones,
  categoriaActiva,
  promocionActiva,
  onSeleccionarCategoria,
  onSeleccionarPromocion,
}: {
  categorias: Categoria[];
  promociones: Promocion[];
  categoriaActiva: string | null;
  promocionActiva: string | null;
  onSeleccionarCategoria: (id: string | null) => void;
  onSeleccionarPromocion: (id: string | null) => void;
}) {
  const nadaActivo = categoriaActiva === null && promocionActiva === null;
  return (
    <div className="flex gap-1 overflow-x-auto border-b bg-background px-4 py-2">
      <button
        type="button"
        onClick={() => onSeleccionarCategoria(null)}
        className={cn(
          'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium',
          nadaActivo
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent',
        )}
      >
        Todas
      </button>
      {/* Pseudo-categorías de promociones vigentes (visualmente distintas) */}
      {promociones.map((p) => (
        <button
          key={`promo-${p.id}`}
          type="button"
          onClick={() => onSeleccionarPromocion(p.id)}
          className={cn(
            'shrink-0 rounded-md border-2 px-3 py-1.5 text-sm font-medium',
            promocionActiva === p.id
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-primary/40 bg-primary/5 text-primary hover:bg-primary/10',
          )}
          title={p.descripcion ?? p.nombre}
        >
          <span className="mr-1">{p.iconoEmoji ?? '✨'}</span>
          {p.nombre}
        </button>
      ))}
      {categorias.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSeleccionarCategoria(c.id)}
          className={cn(
            'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium',
            categoriaActiva === c.id
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
              <div className="flex-1">
                <p className="line-clamp-2 text-sm font-semibold">{item.nombre}</p>
                {item.promocionNombre && (
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    🏷 {item.promocionNombre}
                    {item.promocionNxm && unidadesGratisNxm(item) > 0 && (
                      <span className="ml-1 normal-case opacity-80">
                        ({unidadesGratisNxm(item)} gratis)
                      </span>
                    )}
                  </p>
                )}
              </div>
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

/**
 * Tarjeta especial para promociones tipo COMBO. En vez de mostrar productos
 * individuales, muestra los items del combo y un botón grande para cargarlos
 * todos al carrito como una unidad. El backend recalcula los precios al
 * recibir los items prorrateados.
 */
function ComboCard({
  promo,
  productos,
  onCargar,
}: {
  promo: Promocion;
  productos: ProductoListado[];
  onCargar: () => void;
}) {
  const productosCombo = promo.productos
    .map((pp) => ({
      cantidad: pp.cantidadMin,
      prod: productos.find((p) => p.id === pp.productoVentaId),
    }))
    .filter((x): x is { cantidad: number; prod: ProductoListado } => Boolean(x.prod));
  const sumaBase = productosCombo.reduce((acc, x) => acc + Number(x.prod.precio) * x.cantidad, 0);
  const precioCombo = Number(promo.precioFijo ?? 0);
  const ahorro = sumaBase - precioCombo;

  return (
    <div className="mx-auto max-w-md rounded-lg border-2 border-primary/40 bg-primary/5 p-5">
      <h3 className="mb-1 text-lg font-bold">
        {promo.iconoEmoji ?? '✨'} {promo.nombre}
      </h3>
      {promo.descripcion && (
        <p className="mb-3 text-xs text-muted-foreground">{promo.descripcion}</p>
      )}
      <ul className="mb-3 space-y-1 text-sm">
        {productosCombo.map((x) => (
          <li key={x.prod.id} className="flex justify-between gap-2">
            <span>
              <span className="font-mono text-xs text-muted-foreground">{x.cantidad}×</span>{' '}
              {x.prod.nombre}
            </span>
            <span className="text-xs text-muted-foreground line-through tabular-nums">
              Gs. {(Number(x.prod.precio) * x.cantidad).toLocaleString('es-PY')}
            </span>
          </li>
        ))}
      </ul>
      <div className="mb-3 flex items-center justify-between border-t pt-2">
        <span className="text-sm font-semibold">Total combo</span>
        <div className="text-right">
          <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            Gs. {precioCombo.toLocaleString('es-PY')}
          </p>
          {ahorro > 0 && (
            <p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Ahorrás Gs. {ahorro.toLocaleString('es-PY')}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onCargar}
        className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/90"
      >
        Cargar combo
      </button>
    </div>
  );
}
