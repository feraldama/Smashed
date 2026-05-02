'use client';

import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  Printer,
  Receipt,
  Send,
  ShoppingBag,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { ConfigPedido, isIncompleto } from './ConfigPedido';
import { toast } from './Toast';

import {
  cartToPedidoInput,
  type MetodoPagoCode,
  useConfirmarPedido,
  useCrearPedido,
  useEmitirComprobante,
} from '@/hooks/usePedidos';
import { ApiError } from '@/lib/api';
import { type CartItem, totalCarrito, totalItem, useCartStore } from '@/lib/cart-store';
import { cn, formatGs } from '@/lib/utils';


/**
 * Sidebar/drawer del carrito con flujo completo:
 *  vista 'cart'  → items + total + botón "Cobrar"
 *  vista 'cobro' → método de pago + botón "Emitir comprobante"
 *  vista 'exito' → # de comprobante fiscal + botón "Tomar otro pedido"
 */

type Vista = 'cart' | 'cobro' | 'exito';

interface CartSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function CartSidebar({ open, onClose }: CartSidebarProps) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />
      )}

      <aside
        className={cn(
          'fixed top-0 right-0 z-40 flex h-screen w-full max-w-md flex-col border-l bg-card shadow-xl transition-transform',
          'lg:static lg:translate-x-0 lg:shadow-none lg:max-w-[24rem]',
          open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <CartContent onClose={onClose} />
      </aside>
    </>
  );
}

function CartContent({ onClose }: { onClose: () => void }) {
  const items = useCartStore((s) => s.items);
  const cambiarCantidad = useCartStore((s) => s.cambiarCantidad);
  const eliminar = useCartStore((s) => s.eliminar);
  const clear = useCartStore((s) => s.clear);

  const [vista, setVista] = useState<Vista>('cart');
  const [pedidoConfirmadoId, setPedidoConfirmadoId] = useState<string | null>(null);
  const [comprobante, setComprobante] = useState<{
    id: string;
    numero: string;
    tipo: string;
  } | null>(null);

  const total = totalCarrito(items);

  function reset() {
    setVista('cart');
    setPedidoConfirmadoId(null);
    setComprobante(null);
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          {vista !== 'cart' && vista !== 'exito' && (
            <button
              type="button"
              onClick={() => setVista('cart')}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              aria-label="Volver"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          {vista === 'cart' && <ShoppingBag className="h-5 w-5 text-primary" />}
          {vista === 'cobro' && <CreditCard className="h-5 w-5 text-primary" />}
          {vista === 'exito' && <Receipt className="h-5 w-5 text-emerald-600" />}
          <h2 className="text-base font-semibold">
            {vista === 'cart' && 'Carrito'}
            {vista === 'cobro' && 'Método de pago'}
            {vista === 'exito' && 'Comprobante emitido'}
          </h2>
          {vista === 'cart' && items.length > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
              {items.reduce((acc, it) => acc + it.cantidad, 0)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {vista === 'cart' && (
        <CartView
          items={items}
          total={total}
          onIrACobro={() => setVista('cobro')}
          onIncrease={(id) => cambiarCantidad(id, +1)}
          onDecrease={(id) => cambiarCantidad(id, -1)}
          onRemove={eliminar}
          onClearCart={() => {
            clear();
            toast.success('Carrito vaciado');
          }}
        />
      )}

      {vista === 'cobro' && (
        <CobroView
          items={items}
          total={total}
          pedidoConfirmadoId={pedidoConfirmadoId}
          onPedidoConfirmado={setPedidoConfirmadoId}
          onComprobanteEmitido={(comp) => {
            setComprobante(comp);
            setVista('exito');
            clear();
          }}
        />
      )}

      {vista === 'exito' && comprobante && (
        <ExitoView
          comprobante={comprobante}
          onTomarOtro={() => {
            reset();
            onClose();
          }}
        />
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  VISTA: CARRITO
// ───────────────────────────────────────────────────────────────────────────

interface CartViewProps {
  items: CartItem[];
  total: number;
  onIrACobro: () => void;
  onIncrease: (id: string) => void;
  onDecrease: (id: string) => void;
  onRemove: (id: string) => void;
  onClearCart: () => void;
}

function CartView({
  items,
  total,
  onIrACobro,
  onIncrease,
  onDecrease,
  onRemove,
  onClearCart,
}: CartViewProps) {
  const meta = useCartStore((s) => s.meta);
  const totalIvaApprox = Math.round(total / 11);
  const subtotalApprox = total - totalIvaApprox;
  const incompleto = isIncompleto(meta);

  return (
    <>
      <ConfigPedido />

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
            <ShoppingBag className="h-10 w-10 opacity-30" />
            <p className="text-sm">El carrito está vacío</p>
            <p className="text-xs">Tocá un producto para agregarlo</p>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((it) => (
              <CartLine
                key={it.localId}
                item={it}
                onIncrease={() => onIncrease(it.localId)}
                onDecrease={() => onDecrease(it.localId)}
                onRemove={() => onRemove(it.localId)}
              />
            ))}
          </ul>
        )}
      </div>

      {items.length > 0 && (
        <div className="border-t p-4">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <dt>Subtotal (sin IVA)</dt>
              <dd className="font-mono">{formatGs(subtotalApprox)}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>IVA 10%</dt>
              <dd className="font-mono">{formatGs(totalIvaApprox)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1 text-base font-bold">
              <dt>Total</dt>
              <dd className="font-mono text-primary">{formatGs(total)}</dd>
            </div>
          </dl>

          {incompleto && (
            <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-900">
              ⚠ Completá los datos del pedido arriba (mesa, cliente o dirección).
            </p>
          )}

          <button
            type="button"
            onClick={onIrACobro}
            disabled={incompleto}
            className={cn(
              'mt-4 flex w-full items-center justify-between gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow',
              'hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <span>Cobrar y emitir</span>
            <span className="font-mono">{formatGs(total)}</span>
          </button>

          <button
            type="button"
            onClick={onClearCart}
            className="mt-2 w-full rounded-md border border-input py-2 text-xs text-muted-foreground hover:bg-accent"
          >
            Vaciar carrito
          </button>
        </div>
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  VISTA: COBRO
// ───────────────────────────────────────────────────────────────────────────

const METODOS_PAGO: Array<{
  codigo: MetodoPagoCode;
  label: string;
  icon: typeof Banknote;
  group?: string;
}> = [
  { codigo: 'EFECTIVO', label: 'Efectivo', icon: Banknote },
  { codigo: 'TARJETA_DEBITO', label: 'Débito', icon: CreditCard },
  { codigo: 'TARJETA_CREDITO', label: 'Crédito', icon: CreditCard },
  { codigo: 'BANCARD', label: 'Bancard', icon: CreditCard },
  { codigo: 'INFONET', label: 'Infonet', icon: CreditCard },
  { codigo: 'TIGO_MONEY', label: 'Tigo Money', icon: Smartphone },
  { codigo: 'PERSONAL_PAY', label: 'Personal Pay', icon: Smartphone },
  { codigo: 'ZIMPLE', label: 'Zimple', icon: Smartphone },
  { codigo: 'TRANSFERENCIA', label: 'Transferencia', icon: Send },
];

interface CobroViewProps {
  items: CartItem[];
  total: number;
  pedidoConfirmadoId: string | null;
  onPedidoConfirmado: (id: string) => void;
  onComprobanteEmitido: (comp: { id: string; numero: string; tipo: string }) => void;
}

function CobroView({
  items,
  total,
  pedidoConfirmadoId,
  onPedidoConfirmado,
  onComprobanteEmitido,
}: CobroViewProps) {
  const crearPedido = useCrearPedido();
  const confirmarPedido = useConfirmarPedido();
  const emitir = useEmitirComprobante();
  const meta = useCartStore((s) => s.meta);

  const [metodo, setMetodo] = useState<MetodoPagoCode | null>(null);
  const [tipoDoc, setTipoDoc] = useState<'TICKET' | 'FACTURA'>('TICKET');
  const [referencia, setReferencia] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const trabajando = crearPedido.isPending || confirmarPedido.isPending || emitir.isPending;
  const requiereReferencia = metodo
    ? [
        'TARJETA_DEBITO',
        'TARJETA_CREDITO',
        'BANCARD',
        'INFONET',
        'TRANSFERENCIA',
        'CHEQUE',
      ].includes(metodo)
    : false;

  async function handleEmitir() {
    if (!metodo) {
      setErrorMsg('Seleccioná un método de pago');
      return;
    }
    setErrorMsg(null);

    try {
      let pedidoId = pedidoConfirmadoId;

      // 1) Crear + confirmar (sólo si todavía no se hizo — permite reintento sin duplicar)
      if (!pedidoId) {
        const created = await crearPedido.mutateAsync(
          cartToPedidoInput(items, {
            tipo: meta.tipo,
            mesaId: meta.mesaId,
            clienteId: meta.clienteId,
            direccionEntregaId: meta.direccionEntregaId,
            observaciones: meta.observaciones,
          }),
        );
        await confirmarPedido.mutateAsync(created.pedido.id);
        pedidoId = created.pedido.id;
        onPedidoConfirmado(pedidoId);
      }

      // 2) Emitir comprobante
      const comp = await emitir.mutateAsync({
        pedidoId,
        tipoDocumento: tipoDoc,
        pagos: [
          {
            metodo,
            monto: total,
            referencia: requiereReferencia && referencia ? referencia : undefined,
          },
        ],
      });

      onComprobanteEmitido({
        id: comp.comprobante.id,
        numero: comp.comprobante.numeroDocumento,
        tipo: comp.comprobante.tipoDocumento,
      });
      toast.success(
        `${comp.comprobante.tipoDocumento} ${comp.comprobante.numeroDocumento} emitido`,
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error al emitir comprobante';
      setErrorMsg(msg);
      toast.error(msg);
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4">
        {/* Total grande */}
        <div className="mb-5 rounded-lg border-2 border-primary/20 bg-primary/5 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total a cobrar</p>
          <p className="mt-1 font-mono text-3xl font-bold text-primary">{formatGs(total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {items.length} ítem{items.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Tipo de documento */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tipo de documento
          </p>
          <div className="grid grid-cols-2 gap-2">
            <DocPill
              label="Ticket"
              active={tipoDoc === 'TICKET'}
              onClick={() => setTipoDoc('TICKET')}
            />
            <DocPill
              label="Factura"
              active={tipoDoc === 'FACTURA'}
              onClick={() => setTipoDoc('FACTURA')}
            />
          </div>
        </div>

        {/* Método de pago */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Método de pago
          </p>
          <div className="grid grid-cols-3 gap-2">
            {METODOS_PAGO.map((m) => {
              const Icon = m.icon;
              const active = metodo === m.codigo;
              return (
                <button
                  key={m.codigo}
                  type="button"
                  onClick={() => setMetodo(m.codigo)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-md border p-3 text-xs transition-all',
                    active
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                      : 'border-input hover:bg-accent',
                  )}
                >
                  <Icon className={cn('h-5 w-5', active && 'text-primary')} />
                  <span className="font-medium">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Referencia (para tarjeta/transferencia) */}
        {requiereReferencia && (
          <div className="mt-4">
            <label
              htmlFor="ref"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Referencia / N° autorización
            </label>
            <input
              id="ref"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Últimos 4 dígitos / nro. operación"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {errorMsg}
          </div>
        )}

        {pedidoConfirmadoId && (
          <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-50 p-3 text-xs text-amber-900">
            El pedido se confirmó pero falló la emisión. Cambiá el método y reintentá — el pedido no
            se duplica.
          </div>
        )}
      </div>

      <div className="border-t p-4">
        <button
          type="button"
          onClick={() => {
            void handleEmitir();
          }}
          disabled={trabajando || !metodo}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground shadow',
            'hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed',
          )}
        >
          {trabajando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <Receipt className="h-4 w-4" />
              Emitir {tipoDoc} · {formatGs(total)}
            </>
          )}
        </button>
      </div>
    </>
  );
}

function DocPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  VISTA: ÉXITO
// ───────────────────────────────────────────────────────────────────────────

function ExitoView({
  comprobante,
  onTomarOtro,
}: {
  comprobante: { id: string; numero: string; tipo: string };
  onTomarOtro: () => void;
}) {
  function imprimir() {
    // Abrir en nueva pestaña — la página tiene auto-print al cargar
    window.open(`/comprobantes/${comprobante.id}/print`, '_blank', 'noopener');
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
      </div>
      <h3 className="text-lg font-semibold">{comprobante.tipo} emitido</h3>
      <p className="font-mono text-2xl font-bold text-primary">{comprobante.numero}</p>
      <p className="max-w-xs text-sm text-muted-foreground">
        El pedido se facturó, el stock se descontó y la venta se asoció a tu caja.
      </p>

      <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={imprimir}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Printer className="h-4 w-4" /> Imprimir ticket
        </button>
        <button
          type="button"
          onClick={onTomarOtro}
          className="w-full rounded-md border border-input py-2 text-sm font-medium hover:bg-accent"
        >
          Tomar otro pedido
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Cart line item (sin cambios)
// ───────────────────────────────────────────────────────────────────────────

interface CartLineProps {
  item: CartItem;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}

function CartLine({ item, onIncrease, onDecrease, onRemove }: CartLineProps) {
  const subtotal = totalItem(item);

  return (
    <li className="flex gap-3 p-3">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {item.imagenUrl && (
          <img src={item.imagenUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-semibold">{item.nombre}</p>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-muted"
            aria-label="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {(item.combosOpcion.length > 0 || item.modificadores.length > 0) && (
          <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
            {item.combosOpcion.map((co) => (
              <li key={co.comboGrupoOpcionId}>
                <span className="font-medium">{co.comboGrupoNombre}:</span> {co.productoNombre}
                {co.precioExtra > 0 && ` (+${formatGs(co.precioExtra)})`}
              </li>
            ))}
            {item.modificadores.map((mod) => (
              <li key={mod.modificadorOpcionId}>
                + {mod.nombre}
                {mod.precioExtra > 0 && ` (${formatGs(mod.precioExtra)})`}
              </li>
            ))}
          </ul>
        )}

        {item.observaciones && (
          <p className="mt-1 text-[11px] italic text-muted-foreground">"{item.observaciones}"</p>
        )}

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-md border">
            <button
              type="button"
              onClick={onDecrease}
              className="px-1.5 py-1 hover:bg-muted"
              aria-label="Disminuir"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-6 text-center text-xs font-mono font-semibold">{item.cantidad}</span>
            <button
              type="button"
              onClick={onIncrease}
              className="px-1.5 py-1 hover:bg-muted"
              aria-label="Aumentar"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <span className="text-sm font-mono font-semibold">{formatGs(subtotal)}</span>
        </div>
      </div>
    </li>
  );
}
