'use client';

import { Layers, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { ComboFormModal } from '@/components/ComboFormModal';
import { toast } from '@/components/Toast';
import { type ProductoListado, useEliminarProducto, useProductos } from '@/hooks/useCatalogo';
import { ApiError } from '@/lib/api';

const ROLES_ADMIN = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN'] as const;

export default function CombosPage() {
  return (
    <AuthGate roles={ROLES_ADMIN}>
      <AdminShell>
        <CombosScreen />
      </AdminShell>
    </AuthGate>
  );
}

function CombosScreen() {
  const { data: combos = [], isLoading } = useProductos({
    esCombo: true,
    incluirNoVendibles: true,
  });
  const [editando, setEditando] = useState<{ id: string } | 'NEW' | null>(null);
  const eliminar = useEliminarProducto();

  async function handleEliminar(c: ProductoListado) {
    if (!confirm(`¿Eliminar el combo "${c.nombre}"? Esta acción es lógica.`)) return;
    try {
      await eliminar.mutateAsync(c.id);
      toast.success(`${c.nombre} eliminado`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al eliminar');
    }
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Layers className="h-6 w-6 text-primary" />
            Combos
          </h1>
          <p className="text-sm text-muted-foreground">
            {combos.length} combo{combos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditando('NEW')}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nuevo combo
        </button>
      </header>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : combos.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <Layers className="mx-auto mb-2 h-8 w-8 opacity-30" />
          Sin combos. Creá el primero para ofrecer paquetes con opciones.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Código</th>
                <th className="px-4 py-2 text-left">Nombre</th>
                <th className="px-4 py-2 text-left">Categoría</th>
                <th className="px-4 py-2 text-right">Precio base</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {combos.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-mono text-xs">{c.codigo ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span className="font-medium">{c.nombre}</span>
                    {!c.esVendible && (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                        No vendible
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{c.categoria?.nombre ?? '—'}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    ₲ {Number(c.precioBase).toLocaleString('es-PY')}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditando({ id: c.id })}
                        className="flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleEliminar(c);
                        }}
                        className="flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <ComboFormModal
          productoId={editando === 'NEW' ? null : editando.id}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
