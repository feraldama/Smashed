'use client';

import { ArrowRight, Loader2, Plus, Truck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { type ListarTransferenciasFiltros, useTransferencias } from '@/hooks/useTransferencias';
import { useAuthStore } from '@/lib/auth-store';

const ROLES_ADMIN = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN'] as const;

export default function TransferenciasPage() {
  return (
    <AuthGate roles={ROLES_ADMIN}>
      <AdminShell>
        <TransferenciasScreen />
      </AdminShell>
    </AuthGate>
  );
}

function TransferenciasScreen() {
  const sucursales = useAuthStore((s) => s.user?.sucursales ?? []);
  const [filtros, setFiltros] = useState<ListarTransferenciasFiltros>({});
  const { data: transferencias = [], isLoading } = useTransferencias(filtros);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Truck className="h-6 w-6 text-primary" />
            Transferencias de stock
          </h1>
          <p className="text-sm text-muted-foreground">
            {transferencias.length} transferencia{transferencias.length !== 1 ? 's' : ''} entre
            sucursales
          </p>
        </div>
        <Link
          href="/transferencias/nueva"
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nueva transferencia
        </Link>
      </header>

      {/* Filtros */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <select
          value={filtros.sucursalOrigenId ?? ''}
          onChange={(e) =>
            setFiltros((f) => ({ ...f, sucursalOrigenId: e.target.value || undefined }))
          }
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Origen: todas</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              Desde {s.nombre}
            </option>
          ))}
        </select>
        <select
          value={filtros.sucursalDestinoId ?? ''}
          onChange={(e) =>
            setFiltros((f) => ({ ...f, sucursalDestinoId: e.target.value || undefined }))
          }
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Destino: todas</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              Hacia {s.nombre}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filtros.fechaDesde?.slice(0, 10) ?? ''}
          onChange={(e) =>
            setFiltros((f) => ({
              ...f,
              fechaDesde: e.target.value ? new Date(e.target.value).toISOString() : undefined,
            }))
          }
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Desde"
        />
        <input
          type="date"
          value={filtros.fechaHasta?.slice(0, 10) ?? ''}
          onChange={(e) =>
            setFiltros((f) => ({
              ...f,
              fechaHasta: e.target.value
                ? new Date(`${e.target.value}T23:59:59`).toISOString()
                : undefined,
            }))
          }
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Hasta"
        />
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : transferencias.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          <Truck className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="mb-1 font-medium text-foreground">Sin transferencias registradas</p>
          <p>
            Generá una transferencia para mover insumos entre sucursales — el stock se actualiza de
            forma atómica.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">N°</th>
                <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                <th className="px-3 py-2 text-left font-semibold">Movimiento</th>
                <th className="px-3 py-2 text-right font-semibold">Items</th>
                <th className="px-3 py-2 text-left font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {transferencias.map((t) => (
                <tr key={t.id} className="hover:bg-accent/40">
                  <td className="px-3 py-2 font-mono">
                    <Link href={`/transferencias/${t.id}`} className="hover:underline">
                      #{t.numero}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {new Date(t.fechaSolicitud).toLocaleDateString('es-PY', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono">
                        {t.sucursalOrigen.codigo}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono">
                        {t.sucursalDestino.codigo}
                      </span>
                      <span className="text-muted-foreground">
                        {t.sucursalOrigen.nombre} → {t.sucursalDestino.nombre}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">{t._count.items}</td>
                  <td className="px-3 py-2">
                    <EstadoBadge estado={t.estado} />
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

function EstadoBadge({ estado }: { estado: string }) {
  const styles: Record<string, string> = {
    RECIBIDA:
      'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200',
    PENDIENTE:
      'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200',
    APROBADA:
      'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200',
    EN_TRANSITO:
      'border-purple-300 bg-purple-50 text-purple-900 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-200',
    RECHAZADA:
      'border-red-300 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200',
    CANCELADA:
      'border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
  };
  const style = styles[estado] ?? styles.CANCELADA;
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style}`}
    >
      {estado.replace(/_/g, ' ')}
    </span>
  );
}
