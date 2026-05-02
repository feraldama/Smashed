'use client';

import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { EstadoSifenBadge } from '@/components/EstadoSifenBadge';
import { type ComprobantesFiltros, useComprobantes } from '@/hooks/useComprobantes';
import { cn } from '@/lib/utils';

export default function ComprobantesPage() {
  return (
    <AuthGate>
      <AdminShell>
        <ComprobantesScreen />
      </AdminShell>
    </AuthGate>
  );
}

function ComprobantesScreen() {
  const [filtros, setFiltros] = useState<ComprobantesFiltros>({ pageSize: 100 });

  const { data: comprobantes = [], isLoading } = useComprobantes(filtros);

  const totales = comprobantes.reduce<{
    total: bigint;
    porEstado: Record<string, number>;
  }>(
    (acc, c) => {
      acc.total += BigInt(c.total);
      acc.porEstado[c.estadoSifen] = (acc.porEstado[c.estadoSifen] ?? 0) + 1;
      return acc;
    },
    { total: 0n, porEstado: {} },
  );

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comprobantes</h1>
          <p className="text-sm text-muted-foreground">
            {comprobantes.length} comprobante{comprobantes.length !== 1 ? 's' : ''} — total{' '}
            {formatGs(totales.total)}
          </p>
        </div>
      </header>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border bg-card p-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Estado
          </label>
          <select
            value={filtros.estado ?? ''}
            onChange={(e) =>
              setFiltros((f) => ({
                ...f,
                estado: (e.target.value || undefined) as ComprobantesFiltros['estado'],
              }))
            }
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            <option value="EMITIDO">Emitidos</option>
            <option value="ANULADO">Anulados</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Desde
          </label>
          <input
            type="date"
            value={filtros.desde?.slice(0, 10) ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value || undefined }))}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Hasta
          </label>
          <input
            type="date"
            value={filtros.hasta?.slice(0, 10) ?? ''}
            onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value || undefined }))}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        {(filtros.estado || filtros.desde || filtros.hasta) && (
          <button
            type="button"
            onClick={() => setFiltros({ pageSize: 100 })}
            className="rounded-md border border-input px-2 py-1.5 text-xs hover:bg-accent"
          >
            Limpiar filtros
          </button>
        )}

        {/* Resumen por estado SIFEN */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {(['APROBADO', 'PENDIENTE', 'RECHAZADO', 'NO_ENVIADO', 'CANCELADO'] as const).map((e) => {
            const n = totales.porEstado[e] ?? 0;
            if (n === 0) return null;
            return (
              <div key={e} className="flex items-center gap-1.5 text-xs">
                <EstadoSifenBadge estado={e} size="xs" />
                <span className="font-semibold">{n}</span>
              </div>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : comprobantes.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 h-8 w-8 opacity-30" />
          Sin comprobantes en el rango seleccionado
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">N°</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2 text-center">SIFEN</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {comprobantes.map((c) => (
                <tr
                  key={c.id}
                  className={cn('hover:bg-muted/20', c.estado === 'ANULADO' && 'opacity-60')}
                >
                  <td className="px-3 py-2.5 font-mono text-xs">{c.numeroDocumento}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs font-semibold">{labelTipo(c.tipoDocumento)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatFecha(c.fechaEmision)}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{c.cliente?.razonSocial ?? 'Consumidor final'}</p>
                    {c.cliente?.ruc && (
                      <p className="text-[11px] text-muted-foreground">
                        RUC {c.cliente.ruc}-{c.cliente.dv}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {formatGs(BigInt(c.total))}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {c.estado === 'ANULADO' ? (
                      <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-900">
                        Anulado
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-900">
                        Emitido
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <EstadoSifenBadge estado={c.estadoSifen} size="xs" />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/comprobantes/${c.id}`}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Ver <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function labelTipo(t: string): string {
  switch (t) {
    case 'TICKET':
      return 'Ticket';
    case 'FACTURA':
      return 'Factura';
    case 'NOTA_CREDITO':
      return 'Nota crédito';
    case 'NOTA_DEBITO':
      return 'Nota débito';
    case 'AUTOFACTURA':
      return 'Autofactura';
    case 'NOTA_REMISION':
      return 'Nota remisión';
    default:
      return t;
  }
}

function formatGs(n: bigint): string {
  return `Gs. ${n.toLocaleString('es-PY')}`;
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
