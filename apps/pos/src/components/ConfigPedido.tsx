'use client';

import { Bike, ChevronDown, ChevronUp, MapPin, Store, Users } from 'lucide-react';
import { useState } from 'react';

import { ClienteSearch } from '@/components/ClienteSearch';
import { MesaSelector } from '@/components/MesaSelector';
import { TipoPedidoSelector } from '@/components/TipoPedidoSelector';
import { useCartStore } from '@/lib/cart-store';
import { cn } from '@/lib/utils';

/**
 * Panel colapsable para configurar el tipo de pedido y los datos asociados.
 * Se monta al inicio del carrito.
 */
export function ConfigPedido() {
  const meta = useCartStore((s) => s.meta);
  const setMeta = useCartStore((s) => s.setMeta);
  const [abierto, setAbierto] = useState(false);

  const TipoIcon =
    meta.tipo === 'MESA'
      ? Users
      : meta.tipo === 'DELIVERY_PROPIO'
        ? Bike
        : meta.tipo === 'RETIRO_LOCAL'
          ? Store
          : MapPin;

  const labelTipo: Record<typeof meta.tipo, string> = {
    MOSTRADOR: 'Mostrador',
    MESA: 'Mesa',
    DELIVERY_PROPIO: 'Delivery',
    RETIRO_LOCAL: 'Retiro',
  };

  // Texto secundario según tipo
  let subtexto = 'Venta directa en el local';
  if (meta.tipo === 'MESA') subtexto = meta.mesaLabel ?? '⚠ Falta seleccionar mesa';
  else if (meta.tipo === 'DELIVERY_PROPIO')
    subtexto = meta.clienteNombre
      ? meta.direccionLabel
        ? `${meta.clienteNombre} · ${meta.direccionLabel}`
        : `${meta.clienteNombre} · ⚠ Sin dirección`
      : '⚠ Falta seleccionar cliente';
  else if (meta.tipo === 'RETIRO_LOCAL') subtexto = meta.clienteNombre ?? 'Cliente sin especificar';

  const incompleto = isIncompleto(meta);

  return (
    <div className="border-b">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30',
          incompleto && 'bg-amber-500/5',
        )}
      >
        <TipoIcon className={cn('h-4 w-4', incompleto ? 'text-amber-600' : 'text-primary')} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labelTipo[meta.tipo]}
          </p>
          <p
            className={cn(
              'truncate text-xs',
              incompleto ? 'font-semibold text-amber-700' : 'text-foreground',
            )}
          >
            {subtexto}
          </p>
        </div>
        {abierto ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {abierto && (
        <div className="space-y-3 border-t bg-muted/20 p-3">
          <TipoPedidoSelector
            value={meta.tipo}
            onChange={(t) =>
              setMeta({
                tipo: t,
                // Limpiar campos no relevantes al cambiar tipo
                mesaId: t === 'MESA' ? meta.mesaId : null,
                mesaLabel: t === 'MESA' ? meta.mesaLabel : null,
                clienteId: t !== 'MOSTRADOR' ? meta.clienteId : null,
                clienteNombre: t !== 'MOSTRADOR' ? meta.clienteNombre : null,
                direccionEntregaId: t === 'DELIVERY_PROPIO' ? meta.direccionEntregaId : null,
                direccionLabel: t === 'DELIVERY_PROPIO' ? meta.direccionLabel : null,
              })
            }
          />

          {meta.tipo === 'MESA' && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Seleccionar mesa
              </p>
              <MesaSelector
                selectedId={meta.mesaId}
                onSelect={(m, label) => setMeta({ mesaId: m.id, mesaLabel: label })}
              />
            </div>
          )}

          {(meta.tipo === 'DELIVERY_PROPIO' || meta.tipo === 'RETIRO_LOCAL') && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cliente
              </p>
              <ClienteSearch
                selectedId={meta.clienteId}
                selectedLabel={meta.clienteNombre}
                onSelect={(c, label) =>
                  setMeta({
                    clienteId: c?.id ?? null,
                    clienteNombre: label,
                    // limpiar dirección si cambiamos cliente
                    direccionEntregaId: null,
                    direccionLabel: null,
                  })
                }
                requiereDireccion={meta.tipo === 'DELIVERY_PROPIO'}
                direccionEntregaId={meta.direccionEntregaId}
                onDireccionSelect={(id, label) =>
                  setMeta({ direccionEntregaId: id, direccionLabel: label })
                }
              />
            </div>
          )}

          <textarea
            value={meta.observaciones ?? ''}
            onChange={(e) => setMeta({ observaciones: e.target.value || null })}
            rows={2}
            placeholder="Observaciones del pedido (opcional)"
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
          />
        </div>
      )}
    </div>
  );
}

export function isIncompleto(meta: ReturnType<typeof useCartStore.getState>['meta']): boolean {
  if (meta.tipo === 'MESA' && !meta.mesaId) return true;
  if (meta.tipo === 'DELIVERY_PROPIO' && (!meta.clienteId || !meta.direccionEntregaId)) return true;
  // Para RETIRO_LOCAL el cliente es opcional (puede ir como SIN NOMBRE)
  return false;
}
