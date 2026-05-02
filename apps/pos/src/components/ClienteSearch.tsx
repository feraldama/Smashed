'use client';

import { Loader2, Plus, Search, UserCheck, UserPlus, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import {
  type ClienteListado,
  useClienteDetalle,
  useClientesPos,
  useCrearClientePos,
} from '@/hooks/useClientesPos';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ClienteSearchProps {
  selectedId: string | null;
  selectedLabel: string | null;
  onSelect: (cliente: ClienteListado | null, label: string | null) => void;
  /** Si true, también pide elegir/agregar dirección de entrega. */
  requiereDireccion?: boolean;
  direccionEntregaId?: string | null;
  onDireccionSelect?: (dirId: string, label: string) => void;
}

export function ClienteSearch({
  selectedId,
  selectedLabel,
  onSelect,
  requiereDireccion,
  direccionEntregaId,
  onDireccionSelect,
}: ClienteSearchProps) {
  const [busqueda, setBusqueda] = useState('');
  const [creandoCliente, setCreandoCliente] = useState(false);

  const { data: clientes = [], isFetching } = useClientesPos(busqueda.trim());
  const { data: detalle } = useClienteDetalle(selectedId);

  if (selectedId && detalle) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{detalle.razonSocial}</p>
            {detalle.ruc && (
              <p className="font-mono text-xs text-muted-foreground">
                RUC {detalle.ruc}-{detalle.dv}
              </p>
            )}
            {detalle.documento && (
              <p className="font-mono text-xs text-muted-foreground">Doc {detalle.documento}</p>
            )}
            {detalle.telefono && (
              <p className="text-xs text-muted-foreground">{detalle.telefono}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSelect(null, null)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Cambiar cliente"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {requiereDireccion && (
          <DireccionPicker
            cliente={detalle}
            selectedId={direccionEntregaId ?? null}
            onSelect={onDireccionSelect ?? (() => {})}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, RUC, CI o teléfono..."
          autoFocus
          className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
        />
      </div>

      {busqueda.trim().length >= 2 && (
        <div className="max-h-56 overflow-y-auto rounded-md border bg-card">
          {isFetching ? (
            <div className="flex h-16 items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : clientes.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">
              Sin coincidencias.{' '}
              <button
                type="button"
                onClick={() => setCreandoCliente(true)}
                className="text-primary hover:underline"
              >
                Crear nuevo
              </button>
            </p>
          ) : (
            <ul className="divide-y">
              {clientes.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c, c.razonSocial)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.razonSocial}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {c.ruc ? `${c.ruc}-${c.dv}` : (c.documento ?? '—')}
                        {c.telefono && ` · ${c.telefono}`}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setCreandoCliente(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-input py-2 text-xs text-muted-foreground hover:bg-accent"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Crear cliente nuevo
      </button>

      {creandoCliente && (
        <CrearClienteRapidoModal
          onClose={() => setCreandoCliente(false)}
          onCreated={(c) => {
            onSelect(c, c.razonSocial);
            setCreandoCliente(false);
          }}
        />
      )}
    </div>
  );
}

function DireccionPicker({
  cliente,
  selectedId,
  onSelect,
}: {
  cliente: {
    id: string;
    direcciones: {
      id: string;
      alias: string | null;
      direccion: string;
      ciudad: string | null;
      esPrincipal: boolean;
    }[];
  };
  selectedId: string | null;
  onSelect: (id: string, label: string) => void;
}) {
  if (cliente.direcciones.length === 0) {
    return (
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-900">
        Este cliente no tiene direcciones registradas. Agregá una desde el panel de admin para poder
        hacer delivery.
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Dirección de entrega
      </p>
      <div className="space-y-1.5">
        {cliente.direcciones.map((d) => {
          const label = d.alias ? `${d.alias}: ${d.direccion}` : d.direccion;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelect(d.id, label)}
              className={cn(
                'flex w-full items-start gap-2 rounded-md border p-2 text-left text-xs transition-colors',
                selectedId === d.id
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                  : 'border-input hover:bg-accent',
              )}
            >
              <input
                type="radio"
                checked={selectedId === d.id}
                onChange={() => onSelect(d.id, label)}
                className="mt-0.5 h-3.5 w-3.5 accent-primary"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{d.alias ?? 'Dirección'}</p>
                <p className="text-muted-foreground">{d.direccion}</p>
                {d.ciudad && <p className="text-[10px] text-muted-foreground">{d.ciudad}</p>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CrearClienteRapidoModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: ClienteListado) => void;
}) {
  const crear = useCrearClientePos();
  const [tipo, setTipo] = useState<'PERSONA_FISICA' | 'PERSONA_JURIDICA'>('PERSONA_FISICA');
  const [razonSocial, setRazonSocial] = useState('');
  const [ruc, setRuc] = useState('');
  const [dv, setDv] = useState('');
  const [documento, setDocumento] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!razonSocial.trim()) return setError('Nombre requerido');

    try {
      const res = await crear.mutateAsync({
        tipoContribuyente: tipo,
        razonSocial: razonSocial.trim(),
        ruc: ruc.trim() || undefined,
        dv: dv.trim() || undefined,
        documento: documento.trim() || undefined,
        telefono: telefono.trim() || undefined,
      });
      toast.success('Cliente creado');
      onCreated(res.cliente);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      const fields =
        apiErr?.details && typeof apiErr.details === 'object'
          ? (apiErr.details as { fieldErrors?: Record<string, string[]> }).fieldErrors
          : undefined;
      let msg = apiErr?.message ?? 'Error';
      if (fields) {
        const k = Object.keys(fields)[0];
        if (k && fields[k]?.[0]) msg = `${k}: ${fields[k][0]}`;
      }
      setError(msg);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-base font-semibold">Crear cliente rápido</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            {(['PERSONA_FISICA', 'PERSONA_JURIDICA'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={cn(
                  'rounded-md border p-2 text-xs',
                  tipo === t
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                    : 'border-input',
                )}
              >
                {t === 'PERSONA_FISICA' ? 'Persona (CI)' : 'Empresa (RUC)'}
              </button>
            ))}
          </div>

          <input
            autoFocus
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            placeholder={tipo === 'PERSONA_FISICA' ? 'Nombre completo' : 'Razón social'}
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
          />

          {tipo === 'PERSONA_JURIDICA' ? (
            <div className="grid grid-cols-[1fr,60px] gap-2">
              <input
                value={ruc}
                onChange={(e) => setRuc(e.target.value.replace(/\D/g, ''))}
                placeholder="RUC"
                className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm font-mono"
                maxLength={8}
              />
              <input
                value={dv}
                onChange={(e) => setDv(e.target.value.replace(/\D/g, '').slice(0, 1))}
                placeholder="DV"
                className="rounded-md border border-input bg-background px-2.5 py-1.5 text-center text-sm font-mono"
                maxLength={1}
              />
            </div>
          ) : (
            <input
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="CI"
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm font-mono"
            />
          )}

          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="Teléfono"
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
          />

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={crear.isPending}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {crear.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Crear cliente
          </button>
        </form>
      </div>
    </div>
  );
}
