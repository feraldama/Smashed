'use client';

import {
  CreditCard,
  Loader2,
  Plus,
  Receipt,
  Smartphone,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { ClienteSelector } from '@/components/pos/ClienteSelector';
import { toast } from '@/components/Toast';
import { type Cliente } from '@/hooks/useClientes';
import {
  type MetodoPago,
  type TipoDocumentoFiscal,
  useEmitirComprobante,
} from '@/hooks/useComprobantes';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Pago {
  id: string;
  metodo: MetodoPago;
  monto: string; // string para input controlado, se parsea al enviar
  referencia: string;
}

interface Props {
  pedidoId: string;
  total: number;
  /** Cliente preseleccionado (ej: el del pedido). null = consumidor final. */
  clienteInicial: Cliente | null;
  onCancel: () => void;
  onSuccess: (comprobanteId: string) => void;
}

const METODOS: {
  value: MetodoPago;
  label: string;
  icon: typeof Wallet;
  requiereReferencia: boolean;
}[] = [
  { value: 'EFECTIVO', label: 'Efectivo', icon: Wallet, requiereReferencia: false },
  { value: 'TARJETA_DEBITO', label: 'T. Débito', icon: CreditCard, requiereReferencia: true },
  { value: 'TARJETA_CREDITO', label: 'T. Crédito', icon: CreditCard, requiereReferencia: true },
  { value: 'TRANSFERENCIA', label: 'Transferencia', icon: CreditCard, requiereReferencia: true },
  { value: 'BANCARD', label: 'Bancard', icon: Smartphone, requiereReferencia: true },
  { value: 'INFONET', label: 'Infonet', icon: Smartphone, requiereReferencia: true },
];

function parseGs(s: string): number {
  return parseInt(s.replace(/\D/g, ''), 10) || 0;
}

function nuevoPago(monto: number, metodo: MetodoPago = 'EFECTIVO'): Pago {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    metodo,
    monto: String(monto),
    referencia: '',
  };
}

export function CobrarModal({ pedidoId, total, clienteInicial, onCancel, onSuccess }: Props) {
  const [tipoDoc, setTipoDoc] = useState<TipoDocumentoFiscal>(
    clienteInicial?.ruc ? 'FACTURA' : 'TICKET',
  );
  const [cliente, setCliente] = useState<Cliente | null>(clienteInicial);
  const [showClienteSelector, setShowClienteSelector] = useState(false);
  const [pagos, setPagos] = useState<Pago[]>([nuevoPago(total)]);
  const emitir = useEmitirComprobante();

  const totalPagado = useMemo(() => pagos.reduce((acc, p) => acc + parseGs(p.monto), 0), [pagos]);
  const diferencia = totalPagado - total;
  const completo = diferencia >= 0;
  const esEfectivoFinal = pagos.length === 1 && pagos[0]?.metodo === 'EFECTIVO';
  const vuelto = esEfectivoFinal ? Math.max(0, diferencia) : 0;
  const insuficiente = totalPagado > 0 && totalPagado < total;

  function actualizarPago(id: string, patch: Partial<Pago>) {
    setPagos((arr) => arr.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function agregarPago() {
    const restante = Math.max(0, total - totalPagado);
    setPagos((arr) => [...arr, nuevoPago(restante, 'EFECTIVO')]);
  }

  function eliminarPago(id: string) {
    setPagos((arr) => (arr.length <= 1 ? arr : arr.filter((p) => p.id !== id)));
  }

  async function handleSubmit() {
    // Si es FACTURA, requiere cliente con RUC (ideal) — pero permitimos sin RUC con warning.
    if (tipoDoc === 'FACTURA' && !cliente) {
      toast.error('FACTURA requiere seleccionar cliente');
      return;
    }
    if (tipoDoc === 'FACTURA' && cliente && !cliente.ruc) {
      if (!confirm('El cliente no tiene RUC. ¿Emitir FACTURA igual?')) return;
    }
    if (insuficiente) {
      toast.error('Falta efectivo / pago');
      return;
    }
    // El backend valida que la suma de pagos == total. Si pagamos más, se ajusta el último
    // pago efectivo para igualar (vuelto). Si no es efectivo el último, debe ser exacto.
    if (diferencia > 0 && !esEfectivoFinal) {
      toast.error('El total pagado supera al total — sólo se admite vuelto en EFECTIVO');
      return;
    }

    // Construir array de pagos: si hay vuelto en efectivo, se le resta del último pago.
    const pagosPayload = pagos
      .filter((p) => parseGs(p.monto) > 0)
      .map((p) => ({
        metodo: p.metodo,
        monto: parseGs(p.monto),
        referencia: p.referencia.trim() || undefined,
      }));
    if (vuelto > 0) {
      const last = pagosPayload[pagosPayload.length - 1];
      if (last) {
        pagosPayload[pagosPayload.length - 1] = { ...last, monto: last.monto - vuelto };
      }
    }

    if (pagosPayload.length === 0 || pagosPayload.reduce((a, p) => a + p.monto, 0) !== total) {
      toast.error('Suma de pagos no coincide con el total');
      return;
    }

    try {
      const res = await emitir.mutateAsync({
        pedidoId,
        clienteId: cliente?.id,
        tipoDocumento: tipoDoc,
        pagos: pagosPayload,
      });
      toast.success(`${tipoDoc} ${res.comprobante.numeroDocumento} emitido`);
      onSuccess(res.comprobante.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al emitir');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold">
            <Wallet className="h-4 w-4" /> Cobrar pedido
          </h2>
          <button type="button" onClick={onCancel} className="rounded-sm p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Total destacado */}
          <div className="rounded-md border-2 border-primary bg-primary/5 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total a cobrar
            </p>
            <p className="text-3xl font-bold tabular-nums">Gs. {total.toLocaleString('es-PY')}</p>
          </div>

          {/* Tipo de documento */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tipo de comprobante
            </label>
            <div className="grid grid-cols-2 gap-2">
              <DocBtn
                active={tipoDoc === 'TICKET'}
                icon={<Receipt className="h-4 w-4" />}
                label="Ticket"
                hint="Sin RUC, no fiscal"
                onClick={() => setTipoDoc('TICKET')}
              />
              <DocBtn
                active={tipoDoc === 'FACTURA'}
                icon={<Receipt className="h-4 w-4" />}
                label="Factura"
                hint="Con RUC, fiscal"
                onClick={() => setTipoDoc('FACTURA')}
              />
            </div>
          </div>

          {/* Cliente */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cliente
            </label>
            <button
              type="button"
              onClick={() => setShowClienteSelector(true)}
              className="flex w-full items-center gap-3 rounded-md border border-input p-3 text-left hover:border-primary/50"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="h-4 w-4" />
              </div>
              <div className="flex-1">
                {cliente ? (
                  <>
                    <p className="text-sm font-semibold">{cliente.razonSocial}</p>
                    <p className="text-xs text-muted-foreground">
                      {cliente.ruc
                        ? `RUC ${cliente.ruc}-${cliente.dv}`
                        : cliente.documento
                          ? `CI ${cliente.documento}`
                          : cliente.esConsumidorFinal
                            ? 'Consumidor final'
                            : 'Sin documento'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Tocá para elegir un cliente</p>
                )}
              </div>
              <span className="text-xs font-medium text-primary">Cambiar</span>
            </button>
            {tipoDoc === 'FACTURA' && cliente && !cliente.ruc && (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                ⚠ Cliente sin RUC. Se va a emitir FACTURA pero idealmente requiere RUC.
              </p>
            )}
          </div>

          {/* Pagos */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pagos ({pagos.length})
              </label>
              {pagos.length < 5 && (
                <button
                  type="button"
                  onClick={agregarPago}
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" /> Agregar pago
                </button>
              )}
            </div>
            <div className="space-y-2">
              {pagos.map((p, idx) => (
                <PagoRow
                  key={p.id}
                  pago={p}
                  index={idx}
                  total={total}
                  pagado={totalPagado}
                  canDelete={pagos.length > 1}
                  onChange={(patch) => actualizarPago(p.id, patch)}
                  onDelete={() => eliminarPago(p.id)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer con totales y botón */}
        <div className="space-y-2 border-t bg-muted/20 px-4 py-3">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pagado</p>
              <p className="font-bold tabular-nums">Gs. {totalPagado.toLocaleString('es-PY')}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {insuficiente ? 'Falta' : vuelto > 0 ? 'Vuelto' : 'Diferencia'}
              </p>
              <p
                className={cn(
                  'font-bold tabular-nums',
                  insuficiente
                    ? 'text-red-700 dark:text-red-300'
                    : vuelto > 0
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-emerald-700 dark:text-emerald-300',
                )}
              >
                Gs. {Math.abs(insuficiente ? total - totalPagado : vuelto).toLocaleString('es-PY')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="font-bold tabular-nums">Gs. {total.toLocaleString('es-PY')}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={emitir.isPending}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={emitir.isPending || !completo || (diferencia > 0 && !esEfectivoFinal)}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              {emitir.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Emitir {tipoDoc === 'TICKET' ? 'ticket' : 'factura'}
            </button>
          </div>
        </div>
      </div>

      {/* Cliente selector */}
      {showClienteSelector && (
        <ClienteSelector
          clienteSeleccionadoId={cliente?.id ?? null}
          requireRuc={tipoDoc === 'FACTURA'}
          onSeleccionar={(c) => {
            setCliente(c);
            setShowClienteSelector(false);
          }}
          onClose={() => setShowClienteSelector(false)}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function DocBtn({
  active,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-0.5 rounded-md border-2 p-3',
        active ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/50',
      )}
    >
      <span className="flex items-center gap-1.5 font-semibold">
        {icon} {label}
      </span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </button>
  );
}

function PagoRow({
  pago,
  index,
  total,
  pagado,
  canDelete,
  onChange,
  onDelete,
}: {
  pago: Pago;
  index: number;
  total: number;
  pagado: number;
  canDelete: boolean;
  onChange: (patch: Partial<Pago>) => void;
  onDelete: () => void;
}) {
  const metodoConfig = METODOS.find((m) => m.value === pago.metodo) ?? METODOS[0];
  const restante = Math.max(0, total - (pagado - parseGs(pago.monto)));

  function quickAmount(monto: number) {
    onChange({ monto: String(parseGs(pago.monto) + monto) });
  }

  return (
    <div className="rounded-md border p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
          {index + 1}
        </span>
        <select
          value={pago.metodo}
          onChange={(e) => onChange({ metodo: e.target.value as MetodoPago })}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          {METODOS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="numeric"
          value={pago.monto}
          onChange={(e) => onChange({ monto: e.target.value.replace(/\D/g, '') })}
          placeholder="0"
          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-right text-sm font-bold tabular-nums"
        />
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
            aria-label="Eliminar pago"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {pago.metodo === 'EFECTIVO' && (
        <div className="mt-2 flex flex-wrap gap-1">
          {[10000, 20000, 50000, 100000].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => quickAmount(m)}
              className="rounded border border-input px-1.5 py-0.5 text-[10px] hover:bg-accent"
            >
              +{m / 1000}k
            </button>
          ))}
          {restante > 0 && (
            <button
              type="button"
              onClick={() => onChange({ monto: String(parseGs(pago.monto) + restante) })}
              className="rounded border border-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
            >
              Restante {restante.toLocaleString('es-PY')}
            </button>
          )}
        </div>
      )}

      {metodoConfig?.requiereReferencia && (
        <input
          type="text"
          value={pago.referencia}
          onChange={(e) => onChange({ referencia: e.target.value })}
          placeholder="Referencia / autorización (opcional)"
          maxLength={100}
          className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
        />
      )}
    </div>
  );
}
