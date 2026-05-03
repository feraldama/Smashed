'use client';

import { ArrowLeft, ArrowRight, Calendar, FileText, Loader2, User } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { useTransferencia } from '@/hooks/useTransferencias';

export default function TransferenciaDetallePage() {
  return (
    <AuthGate>
      <AdminShell>
        <TransferenciaDetalleScreen />
      </AdminShell>
    </AuthGate>
  );
}

function TransferenciaDetalleScreen() {
  const { id } = useParams<{ id: string }>();
  const { data: t, isLoading, isError } = useTransferencia(id);

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !t) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        No se pudo cargar la transferencia.{' '}
        <Link href="/transferencias" className="underline">
          Volver al listado
        </Link>
        .
      </div>
    );
  }

  return (
    <div>
      <header className="mb-5">
        <Link
          href="/transferencias"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver al listado
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            Transferencia <span className="font-mono text-primary">#{t.numero}</span>
          </h1>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            {t.estado.replace(/_/g, ' ')}
          </span>
        </div>
        {/* Origen → Destino */}
        <div className="mt-3 flex items-center gap-3 rounded-lg border bg-card p-3 text-sm shadow-sm">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Desde</p>
            <p className="font-semibold">{t.sucursalOrigen.nombre}</p>
            <p className="font-mono text-xs text-muted-foreground">{t.sucursalOrigen.codigo}</p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Hacia</p>
            <p className="font-semibold">{t.sucursalDestino.nombre}</p>
            <p className="font-mono text-xs text-muted-foreground">{t.sucursalDestino.codigo}</p>
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Items */}
        <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <h2 className="border-b px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Items ({t.items.length})
          </h2>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Insumo</th>
                <th className="px-3 py-2 text-right font-semibold">Solicitada</th>
                <th className="px-3 py-2 text-right font-semibold">Enviada</th>
                <th className="px-3 py-2 text-right font-semibold">Recibida</th>
                <th className="px-3 py-2 text-left font-semibold">UM</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {t.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2">
                    <p className="font-medium">{it.producto.nombre}</p>
                    {it.producto.codigo && (
                      <p className="text-xs text-muted-foreground">{it.producto.codigo}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{it.cantidadSolicitada}</td>
                  <td className="px-3 py-2 text-right font-mono">{it.cantidadEnviada ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {it.cantidadRecibida ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {it.producto.unidadMedida}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> Fechas
            </h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Solicitada</dt>
                <dd>{new Date(t.fechaSolicitud).toLocaleString('es-PY')}</dd>
              </div>
              {t.fechaRecepcion && (
                <div>
                  <dt className="text-xs text-muted-foreground">Recibida</dt>
                  <dd>{new Date(t.fechaRecepcion).toLocaleString('es-PY')}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <User className="h-3.5 w-3.5" /> Responsables
            </h3>
            <dl className="space-y-2 text-sm">
              {t.solicitadoPorNombre && (
                <div>
                  <dt className="text-xs text-muted-foreground">Solicitada por</dt>
                  <dd>{t.solicitadoPorNombre}</dd>
                </div>
              )}
              {t.recibidoPorNombre && (
                <div>
                  <dt className="text-xs text-muted-foreground">Recibida por</dt>
                  <dd>{t.recibidoPorNombre}</dd>
                </div>
              )}
            </dl>
          </section>

          {t.notas && (
            <section className="rounded-lg border bg-card p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Notas
              </h3>
              <p className="whitespace-pre-wrap text-sm">{t.notas}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
