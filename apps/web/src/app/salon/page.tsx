'use client';

import { Armchair, Loader2, Pencil, Plus, Trash2, Users, Utensils } from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { MesaFormModal } from '@/components/MesaFormModal';
import { toast } from '@/components/Toast';
import { ZonaFormModal } from '@/components/ZonaFormModal';
import {
  type EstadoMesa,
  type Mesa,
  useEliminarMesa,
  useEliminarZona,
  useZonasMesas,
  type ZonaMesa,
} from '@/hooks/useMesas';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

const ROLES_ADMIN = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN'] as const;

export default function SalonPage() {
  return (
    <AuthGate roles={ROLES_ADMIN}>
      <AdminShell>
        <SalonScreen />
      </AdminShell>
    </AuthGate>
  );
}

function SalonScreen() {
  const sucursalActivaId = useAuthStore((s) => s.user?.sucursalActivaId ?? null);
  const sucursales = useAuthStore((s) => s.user?.sucursales ?? []);
  const sucursalActiva = sucursales.find((su) => su.id === sucursalActivaId);

  const { data: zonas = [], isLoading } = useZonasMesas();
  const eliminarZona = useEliminarZona();
  const eliminarMesa = useEliminarMesa();

  const [zonaModal, setZonaModal] = useState<ZonaMesa | 'NEW' | null>(null);
  const [mesaModal, setMesaModal] = useState<{ mesa?: Mesa; zonaActualId: string } | null>(null);

  async function handleEliminarZona(z: ZonaMesa) {
    if (!confirm(`¿Eliminar la zona "${z.nombre}"? Sólo se puede si no tiene mesas.`)) return;
    try {
      await eliminarZona.mutateAsync(z.id);
      toast.success(`Zona "${z.nombre}" eliminada`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al eliminar zona');
    }
  }

  async function handleEliminarMesa(m: Mesa) {
    if (!confirm(`¿Eliminar la mesa #${m.numero}?`)) return;
    try {
      await eliminarMesa.mutateAsync(m.id);
      toast.success(`Mesa #${m.numero} eliminada`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al eliminar mesa');
    }
  }

  const totalMesas = zonas.reduce((sum, z) => sum + z.mesas.length, 0);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Utensils className="h-6 w-6 text-primary" />
            Salón / Mesas
          </h1>
          <p className="text-sm text-muted-foreground">
            {sucursalActiva ? (
              <>
                Sucursal: <strong>{sucursalActiva.nombre}</strong> · {zonas.length} zona
                {zonas.length !== 1 ? 's' : ''} · {totalMesas} mesa{totalMesas !== 1 ? 's' : ''}
              </>
            ) : (
              'Seleccioná una sucursal para ver y gestionar mesas'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setZonaModal('NEW')}
          disabled={!sucursalActivaId}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Nueva zona
        </button>
      </header>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : zonas.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          <Utensils className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="mb-1 font-medium text-foreground">Sin zonas configuradas</p>
          <p>Creá la primera zona (ej: "Salón Principal", "Terraza") y agregale mesas.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {zonas.map((zona) => (
            <ZonaSection
              key={zona.id}
              zona={zona}
              onEditZona={() => setZonaModal(zona)}
              onDeleteZona={() => {
                void handleEliminarZona(zona);
              }}
              onAddMesa={() => setMesaModal({ zonaActualId: zona.id })}
              onEditMesa={(mesa) => setMesaModal({ mesa, zonaActualId: zona.id })}
              onDeleteMesa={(mesa) => {
                void handleEliminarMesa(mesa);
              }}
            />
          ))}
        </div>
      )}

      {zonaModal && (
        <ZonaFormModal
          zona={zonaModal === 'NEW' ? undefined : zonaModal}
          sucursalId={sucursalActivaId}
          onClose={() => setZonaModal(null)}
        />
      )}

      {mesaModal && (
        <MesaFormModal
          mesa={mesaModal.mesa}
          zonaActualId={mesaModal.zonaActualId}
          zonas={zonas}
          onClose={() => setMesaModal(null)}
        />
      )}
    </div>
  );
}

function ZonaSection({
  zona,
  onEditZona,
  onDeleteZona,
  onAddMesa,
  onEditMesa,
  onDeleteMesa,
}: {
  zona: ZonaMesa;
  onEditZona: () => void;
  onDeleteZona: () => void;
  onAddMesa: () => void;
  onEditMesa: (mesa: Mesa) => void;
  onDeleteMesa: (mesa: Mesa) => void;
}) {
  return (
    <section className="rounded-lg border bg-card shadow-sm">
      {/* Header de zona */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">{zona.nombre}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
            {zona.mesas.length} mesa{zona.mesas.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-muted-foreground">
            Orden <span className="font-mono">{zona.orden}</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onAddMesa}
            className="flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" /> Mesa
          </button>
          <button
            type="button"
            onClick={onEditZona}
            className="flex items-center gap-1 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Editar zona"
            title="Editar zona"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDeleteZona}
            className="flex items-center gap-1 rounded-md p-1.5 text-destructive hover:bg-destructive/10"
            aria-label="Eliminar zona"
            title="Eliminar zona"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Grid de mesas */}
      {zona.mesas.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          Sin mesas. Hacé click en "+ Mesa" para agregar la primera.
        </div>
      ) : (
        <div className="grid gap-2 p-3 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
          {zona.mesas.map((mesa) => (
            <MesaCard
              key={mesa.id}
              mesa={mesa}
              onEdit={() => onEditMesa(mesa)}
              onDelete={() => onDeleteMesa(mesa)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const ESTADO_STYLES: Record<EstadoMesa, string> = {
  LIBRE:
    'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200',
  OCUPADA:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200',
  RESERVADA:
    'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200',
  LIMPIEZA:
    'border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
};

const ESTADO_LABEL: Record<EstadoMesa, string> = {
  LIBRE: 'Libre',
  OCUPADA: 'Ocupada',
  RESERVADA: 'Reservada',
  LIMPIEZA: 'Limpieza',
};

function MesaCard({
  mesa,
  onEdit,
  onDelete,
}: {
  mesa: Mesa;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ocupada = mesa.estado === 'OCUPADA' || Boolean(mesa.pedidoActivo);
  return (
    <article
      className={cn(
        'group relative flex flex-col rounded-md border p-2.5 transition-colors',
        ESTADO_STYLES[mesa.estado],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Armchair className="h-4 w-4 opacity-70" />
          <span className="text-base font-bold">#{mesa.numero}</span>
        </div>
        <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
          {ESTADO_LABEL[mesa.estado]}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-1 text-[11px] opacity-80">
        <Users className="h-3 w-3" />
        {mesa.capacidad} pers.
      </div>

      {mesa.pedidoActivo && (
        <p className="mt-1 truncate text-[10px] font-mono opacity-80">
          Pedido #{mesa.pedidoActivo.numero}
        </p>
      )}

      {/* Acciones — solo aparecen al hover */}
      <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
        <button
          type="button"
          onClick={onEdit}
          className="rounded bg-background/80 p-1 hover:bg-background"
          aria-label="Editar mesa"
          title="Editar"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={ocupada}
          className="rounded bg-background/80 p-1 text-destructive hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Eliminar mesa"
          title={ocupada ? 'No se puede eliminar — mesa con pedido activo' : 'Eliminar'}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </article>
  );
}
