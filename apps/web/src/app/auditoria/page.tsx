'use client';

import { ChevronDown, ChevronRight, Loader2, ScrollText } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { ACCIONES_AUDITABLES, type AuditLogItem, useAuditoria } from '@/hooks/useAuditoria';
import { cn } from '@/lib/utils';

export default function AuditoriaPage() {
  return (
    <AuthGate>
      <AdminShell>
        <AuditoriaScreen />
      </AdminShell>
    </AuthGate>
  );
}

const PAGE_SIZE = 50;

function AuditoriaScreen() {
  const [accion, setAccion] = useState('');
  const [entidad, setEntidad] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [page, setPage] = useState(1);
  const [expandido, setExpandido] = useState<string | null>(null);

  // Volver a la primera página al cambiar cualquier filtro.
  useEffect(() => {
    setPage(1);
  }, [accion, entidad, desde, hasta]);

  const { data, isLoading, isError } = useAuditoria({
    accion: accion || undefined,
    entidad: entidad.trim() || undefined,
    // El rango de fecha es por día; lo expandimos al día completo (inclusive).
    desde: desde ? `${desde}T00:00:00` : undefined,
    hasta: hasta ? `${hasta}T23:59:59` : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ScrollText className="h-6 w-6 text-primary" /> Auditoría
        </h1>
        <p className="text-sm text-muted-foreground">
          Registro de acciones del sistema: quién hizo qué y cuándo. {total} evento
          {total !== 1 ? 's' : ''}.
        </p>
      </header>

      {/* Filtros */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs">
          <span className="mb-1 block font-semibold uppercase tracking-wide text-muted-foreground">
            Acción
          </span>
          <select
            value={accion}
            onChange={(e) => setAccion(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Todas</option>
            {Object.entries(ACCIONES_AUDITABLES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-semibold uppercase tracking-wide text-muted-foreground">
            Entidad
          </span>
          <input
            value={entidad}
            onChange={(e) => setEntidad(e.target.value)}
            placeholder="Comprobante, Pedido, Caja..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-semibold uppercase tracking-wide text-muted-foreground">
            Desde
          </span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-semibold uppercase tracking-wide text-muted-foreground">
            Hasta
          </span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Error cargando la auditoría. Reintentá en unos segundos.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          <ScrollText className="mx-auto mb-2 h-8 w-8 opacity-30" />
          No hay eventos con esos filtros.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Usuario</th>
                <th className="px-3 py-2 text-left">Acción</th>
                <th className="px-3 py-2 text-left">Entidad</th>
                <th className="px-3 py-2 text-left">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((it) => (
                <FilaAuditoria
                  key={it.id}
                  item={it}
                  abierto={expandido === it.id}
                  onToggle={() => setExpandido((prev) => (prev === it.id ? null : it.id))}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-input px-3 py-1.5 hover:bg-accent disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-muted-foreground">
            Página {page} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={page >= totalPaginas}
            onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
            className="rounded-md border border-input px-3 py-1.5 hover:bg-accent disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}

function FilaAuditoria({
  item,
  abierto,
  onToggle,
}: {
  item: AuditLogItem;
  abierto: boolean;
  onToggle: () => void;
}) {
  const tieneDetalle = Boolean(item.metadata || item.diff || item.entidadId);
  return (
    <>
      <tr
        className={cn('hover:bg-muted/20', tieneDetalle && 'cursor-pointer')}
        onClick={tieneDetalle ? onToggle : undefined}
      >
        <td className="px-2 py-2 text-muted-foreground">
          {tieneDetalle &&
            (abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
          {formatFechaHora(item.createdAt)}
        </td>
        <td className="px-3 py-2">
          {item.usuario ? (
            <span title={item.usuario.email}>{item.usuario.nombreCompleto}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2">
          <span className="inline-flex rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] font-semibold">
            {ACCIONES_AUDITABLES[item.accion] ?? item.accion}
          </span>
        </td>
        <td className="px-3 py-2 text-xs">
          {item.entidad ?? <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">{item.ip ?? '—'}</td>
      </tr>
      {abierto && tieneDetalle && (
        <tr className="bg-muted/20">
          <td />
          <td colSpan={5} className="px-3 py-2">
            <dl className="space-y-2 text-xs">
              {item.entidadId && (
                <div className="flex gap-2">
                  <dt className="font-semibold text-muted-foreground">ID entidad:</dt>
                  <dd className="font-mono">{item.entidadId}</dd>
                </div>
              )}
              {item.sucursal && (
                <div className="flex gap-2">
                  <dt className="font-semibold text-muted-foreground">Sucursal:</dt>
                  <dd>{item.sucursal.nombre}</dd>
                </div>
              )}
              {Boolean(item.metadata) && (
                <div>
                  <dt className="mb-1 font-semibold text-muted-foreground">Detalle</dt>
                  <dd>
                    <pre className="overflow-x-auto rounded-md border bg-background p-2 font-mono text-[11px]">
                      {JSON.stringify(item.metadata, null, 2)}
                    </pre>
                  </dd>
                </div>
              )}
              {Boolean(item.diff) && (
                <div>
                  <dt className="mb-1 font-semibold text-muted-foreground">
                    Cambios (antes/después)
                  </dt>
                  <dd>
                    <pre className="overflow-x-auto rounded-md border bg-background p-2 font-mono text-[11px]">
                      {JSON.stringify(item.diff, null, 2)}
                    </pre>
                  </dd>
                </div>
              )}
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
