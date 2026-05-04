'use client';

import { Loader2, Plus, Search, User, UserCheck, UserPlus, X } from 'lucide-react';
import { useState } from 'react';

import { ClienteFormModal } from '@/components/ClienteFormModal';
import { type Cliente, useClientes } from '@/hooks/useClientes';
import { cn } from '@/lib/utils';

interface Props {
  clienteSeleccionadoId: string | null;
  /** Si requireRuc=true, marca con highlight los clientes sin RUC. */
  requireRuc?: boolean;
  onSeleccionar: (cliente: Cliente | null) => void;
  onClose: () => void;
}

export function ClienteSelector({
  clienteSeleccionadoId,
  requireRuc = false,
  onSeleccionar,
  onClose,
}: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [showForm, setShowForm] = useState(false);
  const { data: clientes = [], isLoading } = useClientes(busqueda.trim() || undefined);

  const consumidorFinal = clientes.find((c) => c.esConsumidorFinal);
  const otros = clientes.filter((c) => !c.esConsumidorFinal);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-bold">Elegí un cliente</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                title="Crear nuevo cliente"
              >
                <UserPlus className="h-3.5 w-3.5" /> Nuevo
              </button>
              <button type="button" onClick={onClose} className="rounded-sm p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por razón social, RUC, CI, teléfono…"
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
                autoFocus
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : clientes.length === 0 ? (
              <div className="p-6 text-center text-sm">
                <p className="mb-3 text-muted-foreground">
                  {busqueda ? 'Sin coincidencias para esa búsqueda.' : 'Buscá un cliente'}
                </p>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> Crear cliente nuevo
                </button>
              </div>
            ) : (
              <ul className="divide-y">
                {/* Consumidor final siempre arriba */}
                {consumidorFinal && (
                  <ClienteRow
                    cliente={consumidorFinal}
                    selected={clienteSeleccionadoId === consumidorFinal.id}
                    warningSinRuc={false}
                    onSelect={() => onSeleccionar(consumidorFinal)}
                  />
                )}
                {otros.map((c) => (
                  <ClienteRow
                    key={c.id}
                    cliente={c}
                    selected={clienteSeleccionadoId === c.id}
                    warningSinRuc={requireRuc && !c.ruc}
                    onSelect={() => onSeleccionar(c)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <ClienteFormModal
          onCreado={(c) => {
            setShowForm(false);
            // Seleccionamos el cliente recién creado y cerramos el selector,
            // así el cajero vuelve al modal de cobro con el cliente cargado.
            onSeleccionar(c);
          }}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}

function ClienteRow({
  cliente,
  selected,
  warningSinRuc,
  onSelect,
}: {
  cliente: Cliente;
  selected: boolean;
  warningSinRuc: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50',
        selected && 'bg-primary/5',
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          cliente.esConsumidorFinal
            ? 'bg-primary/15 text-primary'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {selected ? <UserCheck className="h-4 w-4" /> : <User className="h-4 w-4" />}
      </div>
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <p className="font-semibold">{cliente.razonSocial}</p>
          {cliente.esConsumidorFinal && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
              Cons. final
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {cliente.ruc ? (
            <>
              RUC {cliente.ruc}-{cliente.dv}
            </>
          ) : cliente.documento ? (
            <>CI {cliente.documento}</>
          ) : (
            <span className={warningSinRuc ? 'text-amber-700' : undefined}>
              {warningSinRuc ? '⚠ Sin RUC — para FACTURA conviene tener RUC' : 'Sin documento'}
            </span>
          )}
          {cliente.telefono && <> · {cliente.telefono}</>}
        </p>
      </div>
    </button>
  );
}
