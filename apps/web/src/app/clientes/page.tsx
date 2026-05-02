'use client';

import { Loader2, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { ClienteFormModal } from '@/components/ClienteFormModal';
import { toast } from '@/components/Toast';
import { type Cliente, useClientes, useEliminarCliente } from '@/hooks/useClientes';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function ClientesPage() {
  return (
    <AuthGate>
      <AdminShell>
        <ClientesScreen />
      </AdminShell>
    </AuthGate>
  );
}

function ClientesScreen() {
  const [busqueda, setBusqueda] = useState('');
  const [editing, setEditing] = useState<Cliente | 'NEW' | null>(null);

  const { data: clientes = [], isLoading } = useClientes(busqueda.trim() || undefined);
  const eliminar = useEliminarCliente();

  async function handleEliminar(c: Cliente) {
    if (c.esConsumidorFinal) {
      toast.error('No se puede eliminar el cliente "consumidor final"');
      return;
    }
    if (!confirm(`Eliminar a "${c.razonSocial}"?`)) return;
    try {
      await eliminar.mutateAsync(c.id);
      toast.success('Cliente eliminado');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {clientes.length} cliente{clientes.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing('NEW')}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nuevo cliente
        </button>
      </header>

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, RUC, CI, teléfono..."
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : clientes.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 h-8 w-8 opacity-30" />
          {busqueda ? 'No hay coincidencias' : 'Sin clientes — agregá el primero'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Razón social</th>
                <th className="px-4 py-2 text-left">Tipo</th>
                <th className="px-4 py-2 text-left">RUC / Doc</th>
                <th className="px-4 py-2 text-left">Contacto</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {clientes.map((c) => (
                <tr
                  key={c.id}
                  className={cn('hover:bg-muted/20', c.esConsumidorFinal && 'bg-primary/5')}
                >
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{c.razonSocial}</p>
                    {c.nombreFantasia && (
                      <p className="text-xs text-muted-foreground">{c.nombreFantasia}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.esConsumidorFinal ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                        CONS. FINAL
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {c.tipoContribuyente.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {c.ruc ? `${c.ruc}-${c.dv}` : (c.documento ?? '—')}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {c.telefono && <p>{c.telefono}</p>}
                    {c.email && <p className="text-muted-foreground">{c.email}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(c)}
                        disabled={c.esConsumidorFinal}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleEliminar(c);
                        }}
                        disabled={c.esConsumidorFinal || eliminar.isPending}
                        className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing === 'NEW' && <ClienteFormModal onClose={() => setEditing(null)} />}
      {editing && editing !== 'NEW' && (
        <ClienteFormModal cliente={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
