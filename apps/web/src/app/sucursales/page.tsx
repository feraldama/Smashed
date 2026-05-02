'use client';

import { Building2, CheckCircle2, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { SucursalFormModal } from '@/components/SucursalFormModal';
import { toast } from '@/components/Toast';
import { type Sucursal, useEliminarSucursal, useSucursales } from '@/hooks/useSucursales';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const ROLES_ADMIN = ['ADMIN_EMPRESA', 'SUPER_ADMIN'] as const;

export default function SucursalesPage() {
  return (
    <AuthGate roles={ROLES_ADMIN}>
      <AdminShell>
        <SucursalesScreen />
      </AdminShell>
    </AuthGate>
  );
}

function SucursalesScreen() {
  const { data: sucursales = [], isLoading } = useSucursales();
  const [editando, setEditando] = useState<Sucursal | 'NEW' | null>(null);
  const eliminar = useEliminarSucursal();

  async function handleEliminar(s: Sucursal) {
    if (
      !confirm(`¿Eliminar la sucursal "${s.nombre}"? Esta acción es lógica (no toca histórico).`)
    ) {
      return;
    }
    try {
      await eliminar.mutateAsync(s.id);
      toast.success(`${s.nombre} eliminada`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al eliminar');
    }
  }

  const activas = sucursales.filter((s) => s.activa).length;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Building2 className="h-6 w-6 text-primary" />
            Sucursales
          </h1>
          <p className="text-sm text-muted-foreground">
            {sucursales.length} sucursal{sucursales.length !== 1 ? 'es' : ''} ·{' '}
            <strong>{activas}</strong> activa{activas !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditando('NEW')}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nueva sucursal
        </button>
      </header>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sucursales.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <Building2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
          Sin sucursales. Agregá la primera para empezar a operar.
        </div>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {sucursales.map((s) => (
            <SucursalCard
              key={s.id}
              sucursal={s}
              onEdit={() => setEditando(s)}
              onDelete={() => {
                void handleEliminar(s);
              }}
            />
          ))}
        </div>
      )}

      {editando && (
        <SucursalFormModal
          sucursal={editando === 'NEW' ? undefined : editando}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function SucursalCard({
  sucursal,
  onEdit,
  onDelete,
}: {
  sucursal: Sucursal;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-colors',
        !sucursal.activa && 'opacity-60',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-bold">{sucursal.nombre}</h3>
            {!sucursal.activa && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                Inactiva
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono font-semibold">
              {sucursal.codigo}
            </span>
            <span>
              Estab. <span className="font-mono">{sucursal.establecimiento}</span>
            </span>
          </div>
        </div>
        {sucursal.activa && (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 space-y-1.5 p-4 text-sm">
        <p>
          <span className="text-muted-foreground">📍</span> {sucursal.direccion}
        </p>
        {(sucursal.ciudad || sucursal.departamento) && (
          <p className="text-xs text-muted-foreground">
            {[sucursal.ciudad, sucursal.departamento].filter(Boolean).join(', ')}
          </p>
        )}
        {sucursal.telefono && (
          <p className="text-xs text-muted-foreground">📞 {sucursal.telefono}</p>
        )}
        {sucursal.email && (
          <p className="truncate text-xs text-muted-foreground">✉️ {sucursal.email}</p>
        )}

        <div className="mt-2 flex gap-3 border-t pt-2 text-[11px] text-muted-foreground">
          <span>
            <strong className="text-foreground">{sucursal._count.cajas}</strong> caja
            {sucursal._count.cajas !== 1 ? 's' : ''}
          </span>
          <span>
            <strong className="text-foreground">{sucursal._count.puntosExpedicion}</strong> pto.
            exp.
          </span>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex border-t bg-muted/20">
        <button
          type="button"
          onClick={onEdit}
          className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium hover:bg-accent"
        >
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
        <div className="w-px bg-border" />
        <button
          type="button"
          onClick={onDelete}
          className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" /> Eliminar
        </button>
      </div>
    </article>
  );
}
