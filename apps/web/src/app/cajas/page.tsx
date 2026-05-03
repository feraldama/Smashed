'use client';

import { CheckCircle2, Loader2, Pencil, Plus, Trash2, Wallet, XCircle } from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { CajaFormModal } from '@/components/CajaFormModal';
import { toast } from '@/components/Toast';
import { type CajaListItem, useCajas, useEliminarCaja } from '@/hooks/useCaja';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function CajasPage() {
  return (
    <AuthGate>
      <AdminShell>
        <CajasScreen />
      </AdminShell>
    </AuthGate>
  );
}

function CajasScreen() {
  const sucursalActivaId = useAuthStore((s) => s.user?.sucursalActivaId ?? null);
  const sucursales = useAuthStore((s) => s.user?.sucursales ?? []);
  const sucursalActiva = sucursales.find((s) => s.id === sucursalActivaId);

  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const { data: cajas = [], isLoading } = useCajas({ incluirInactivas });
  const eliminar = useEliminarCaja();

  const [modal, setModal] = useState<CajaListItem | 'NEW' | null>(null);

  async function handleEliminar(c: CajaListItem) {
    if (!confirm(`¿Desactivar la caja "${c.nombre}"? Sus comprobantes históricos no se alteran.`)) {
      return;
    }
    try {
      await eliminar.mutateAsync(c.id);
      toast.success(`Caja "${c.nombre}" desactivada`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al desactivar caja');
    }
  }

  const activas = cajas.filter((c) => c.activa).length;
  const abiertas = cajas.filter((c) => c.estado === 'ABIERTA').length;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Wallet className="h-6 w-6 text-primary" />
            Cajas
          </h1>
          <p className="text-sm text-muted-foreground">
            {sucursalActiva ? (
              <>
                Sucursal: <strong>{sucursalActiva.nombre}</strong> · {activas} activa
                {activas !== 1 ? 's' : ''}
                {abiertas > 0 && ` · ${abiertas} abierta${abiertas !== 1 ? 's' : ''} ahora`}
              </>
            ) : (
              'Seleccioná una sucursal para ver las cajas'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal('NEW')}
          disabled={!sucursalActivaId}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Nueva caja
        </button>
      </header>

      <div className="mb-4">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={incluirInactivas}
            onChange={(e) => setIncluirInactivas(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <span className="text-muted-foreground">Mostrar cajas desactivadas</span>
        </label>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : cajas.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          <Wallet className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="mb-1 font-medium text-foreground">Sin cajas configuradas</p>
          <p>Creá la primera caja (ej: "Caja 1") para empezar a operar.</p>
        </div>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {cajas.map((caja) => (
            <CajaCard
              key={caja.id}
              caja={caja}
              onEdit={() => setModal(caja)}
              onDelete={() => {
                void handleEliminar(caja);
              }}
            />
          ))}
        </div>
      )}

      {modal && (
        <CajaFormModal
          caja={modal === 'NEW' ? undefined : modal}
          sucursalId={sucursalActivaId}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function CajaCard({
  caja,
  onEdit,
  onDelete,
}: {
  caja: CajaListItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const abierta = caja.estado === 'ABIERTA';
  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-colors',
        !caja.activa && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-bold">{caja.nombre}</h3>
            {!caja.activa && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                Inactiva
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{caja.sucursal.nombre}</p>
        </div>
        {abierta ? (
          <CheckCircle2
            className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-label="Abierta"
          />
        ) : (
          <XCircle
            className="h-5 w-5 shrink-0 text-zinc-400 dark:text-zinc-600"
            aria-label="Cerrada"
          />
        )}
      </div>

      <div className="flex-1 space-y-2 p-4 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Estado</p>
          <p
            className={cn('font-semibold', abierta ? 'text-emerald-700 dark:text-emerald-300' : '')}
          >
            {abierta ? 'Abierta' : 'Cerrada'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Punto de expedición
          </p>
          <p className="font-mono text-xs">
            {caja.puntoExpedicion
              ? `${caja.puntoExpedicion.codigo}${
                  caja.puntoExpedicion.descripcion ? ` — ${caja.puntoExpedicion.descripcion}` : ''
                }`
              : 'No asignado'}
          </p>
        </div>
        <div className="flex gap-3 border-t pt-2 text-[11px] text-muted-foreground">
          <span>
            <strong className="text-foreground">{caja._count.aperturas}</strong> apertura
            {caja._count.aperturas !== 1 ? 's' : ''}
          </span>
          <span>
            <strong className="text-foreground">{caja._count.comprobantes}</strong> comprobante
            {caja._count.comprobantes !== 1 ? 's' : ''}
          </span>
        </div>
        {caja.sesionActiva && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Sesión activa
            </p>
            <p className="font-medium">{caja.sesionActiva.usuario.nombreCompleto}</p>
            <p className="text-[10px] text-muted-foreground">
              desde {new Date(caja.sesionActiva.abiertaEn).toLocaleString('es-PY')}
            </p>
          </div>
        )}
      </div>

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
          disabled={!caja.activa || abierta}
          className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-30"
          title={abierta ? 'No se puede desactivar — caja abierta' : 'Desactivar'}
        >
          <Trash2 className="h-3.5 w-3.5" /> Desactivar
        </button>
      </div>
    </article>
  );
}
