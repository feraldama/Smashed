'use client';

import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { GrupoModificadorFormModal } from '@/components/GrupoModificadorFormModal';
import { OpcionModificadorFormModal } from '@/components/OpcionModificadorFormModal';
import { toast } from '@/components/Toast';
import {
  type ModificadorGrupo,
  type ModificadorOpcion,
  useEliminarGrupo,
  useEliminarOpcion,
  useModificadores,
} from '@/hooks/useModificadores';
import { ApiError } from '@/lib/api';
import { cn, formatGs } from '@/lib/utils';

const ROLES_ADMIN = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN'] as const;

export default function ModificadoresPage() {
  return (
    <AuthGate roles={ROLES_ADMIN}>
      <AdminShell>
        <ModificadoresScreen />
      </AdminShell>
    </AuthGate>
  );
}

function ModificadoresScreen() {
  const [busqueda, setBusqueda] = useState('');
  const [grupoModal, setGrupoModal] = useState<ModificadorGrupo | 'NEW' | null>(null);
  const [opcionModal, setOpcionModal] = useState<{
    grupoId: string;
    opcion?: ModificadorOpcion;
  } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: grupos = [], isLoading } = useModificadores(busqueda.trim() || undefined);
  const eliminarGrupo = useEliminarGrupo();

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleEliminarGrupo(g: ModificadorGrupo) {
    if (
      !confirm(
        `¿Eliminar el grupo "${g.nombre}"? Se va a desvincular de los productos. El histórico de pedidos no se altera.`,
      )
    ) {
      return;
    }
    try {
      await eliminarGrupo.mutateAsync(g.id);
      toast.success(`Grupo "${g.nombre}" eliminado`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al eliminar grupo');
    }
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sliders className="h-6 w-6 text-primary" />
            Modificadores
          </h1>
          <p className="text-sm text-muted-foreground">
            {grupos.length} grupo{grupos.length !== 1 ? 's' : ''} ·{' '}
            {grupos.reduce((sum, g) => sum + g.opciones.length, 0)} opciones
          </p>
        </div>
        <button
          type="button"
          onClick={() => setGrupoModal('NEW')}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nuevo grupo
        </button>
      </header>

      <div className="mb-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar grupo..."
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
      ) : grupos.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          <Sliders className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="mb-1 font-medium text-foreground">Sin grupos de modificadores</p>
          <p>Creá uno (ej: "Punto de cocción", "Extras") y vinculalo después a tus productos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map((g) => (
            <GrupoCard
              key={g.id}
              grupo={g}
              expanded={expanded.has(g.id)}
              onToggle={() => toggleExpanded(g.id)}
              onEdit={() => setGrupoModal(g)}
              onDelete={() => {
                void handleEliminarGrupo(g);
              }}
              onAddOpcion={() => setOpcionModal({ grupoId: g.id })}
              onEditOpcion={(opcion) => setOpcionModal({ grupoId: g.id, opcion })}
            />
          ))}
        </div>
      )}

      {grupoModal && (
        <GrupoModificadorFormModal
          grupo={grupoModal === 'NEW' ? undefined : grupoModal}
          onClose={() => setGrupoModal(null)}
        />
      )}

      {opcionModal && (
        <OpcionModificadorFormModal
          grupoId={opcionModal.grupoId}
          opcion={opcionModal.opcion}
          onClose={() => setOpcionModal(null)}
        />
      )}
    </div>
  );
}

function GrupoCard({
  grupo,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onAddOpcion,
  onEditOpcion,
}: {
  grupo: ModificadorGrupo;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddOpcion: () => void;
  onEditOpcion: (opcion: ModificadorOpcion) => void;
}) {
  const eliminar = useEliminarOpcion(grupo.id);

  async function handleEliminarOpcion(o: ModificadorOpcion) {
    if (!confirm(`¿Eliminar la opción "${o.nombre}"?`)) return;
    try {
      await eliminar.mutateAsync(o.id);
      toast.success(`"${o.nombre}" eliminada`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al eliminar');
    }
  }

  const productosCount = grupo._count?.productosVentaAplicados ?? 0;
  const tipoBadge =
    grupo.tipo === 'UNICA'
      ? 'border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-200'
      : 'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200';

  return (
    <article className="overflow-hidden rounded-lg border bg-card shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="text-base font-semibold">{grupo.nombre}</h2>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              tipoBadge,
            )}
          >
            {grupo.tipo}
          </span>
          {grupo.obligatorio && (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              Obligatorio
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {grupo.opciones.length} opc · sel {grupo.minSeleccion}–{grupo.maxSeleccion ?? '∞'} ·
            vinculado a <strong className="text-foreground">{productosCount}</strong> producto
            {productosCount !== 1 ? 's' : ''}
          </span>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onAddOpcion}
            className="flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" /> Opción
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Editar grupo"
            title="Editar grupo"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
            aria-label="Eliminar grupo"
            title="Eliminar grupo"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body — opciones */}
      {expanded && (
        <div className="divide-y">
          {grupo.opciones.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              Sin opciones. Hacé click en "+ Opción" para agregar la primera.
            </div>
          ) : (
            grupo.opciones.map((o) => (
              <OpcionRow
                key={o.id}
                opcion={o}
                onEdit={() => onEditOpcion(o)}
                onDelete={() => {
                  void handleEliminarOpcion(o);
                }}
              />
            ))
          )}
        </div>
      )}
    </article>
  );
}

function OpcionRow({
  opcion,
  onEdit,
  onDelete,
}: {
  opcion: ModificadorOpcion;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const precio = Number.parseInt(opcion.precioExtra, 10);
  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-4 py-2 text-sm',
        !opcion.activo && 'opacity-50',
      )}
    >
      <span className="w-8 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {opcion.orden}
      </span>
      <span className="flex-1 truncate">{opcion.nombre}</span>
      {!opcion.activo && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
          Inactiva
        </span>
      )}
      {precio > 0 ? (
        <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          +{formatGs(precio)}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">sin recargo</span>
      )}
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Editar opción"
          title="Editar"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1 text-destructive hover:bg-destructive/10"
          aria-label="Eliminar opción"
          title="Eliminar"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
