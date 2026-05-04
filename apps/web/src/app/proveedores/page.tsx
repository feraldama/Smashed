'use client';

import { Loader2, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { ProveedorFormModal } from '@/components/ProveedorFormModal';
import { confirmar, toast } from '@/components/Toast';
import { type Proveedor, useEliminarProveedor, useProveedores } from '@/hooks/useProveedores';
import { ApiError } from '@/lib/api';

export default function ProveedoresPage() {
  return (
    <AuthGate>
      <AdminShell>
        <ProveedoresScreen />
      </AdminShell>
    </AuthGate>
  );
}

function ProveedoresScreen() {
  const [busqueda, setBusqueda] = useState('');
  const [editing, setEditing] = useState<Proveedor | 'NEW' | null>(null);

  const { data: proveedores = [], isLoading } = useProveedores(busqueda.trim() || undefined);
  const eliminar = useEliminarProveedor();

  async function handleEliminar(p: Proveedor) {
    const ok = await confirmar({
      titulo: 'Eliminar proveedor',
      mensaje: `¿Eliminar el proveedor "${p.razonSocial}"?`,
      destructivo: true,
      textoConfirmar: 'Eliminar',
    });
    if (!ok) return;
    try {
      await eliminar.mutateAsync(p.id);
      toast.success('Proveedor eliminado');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proveedores</h1>
          <p className="text-sm text-muted-foreground">
            {proveedores.length} proveedor{proveedores.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing('NEW')}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nuevo proveedor
        </button>
      </header>

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, RUC, contacto..."
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
      ) : proveedores.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <Package className="mx-auto mb-2 h-8 w-8 opacity-30" />
          {busqueda ? 'No hay coincidencias' : 'Sin proveedores'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Razón social</th>
                <th className="px-4 py-2 text-left">RUC</th>
                <th className="px-4 py-2 text-left">Contacto</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {proveedores.map((p) => (
                <tr key={p.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{p.razonSocial}</p>
                    {!p.activo && (
                      <span className="text-[10px] uppercase text-muted-foreground">inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {p.ruc ? `${p.ruc}-${p.dv}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {p.contacto && <p>{p.contacto}</p>}
                    {p.telefono && <p className="text-muted-foreground">{p.telefono}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.email ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                        aria-label="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleEliminar(p);
                        }}
                        disabled={eliminar.isPending}
                        className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
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

      {editing === 'NEW' && <ProveedorFormModal onClose={() => setEditing(null)} />}
      {editing && editing !== 'NEW' && (
        <ProveedorFormModal proveedor={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
