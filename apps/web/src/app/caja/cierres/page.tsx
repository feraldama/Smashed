'use client';

import { Calculator, ChevronLeft, ChevronRight, Loader2, Printer, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { DateRangePicker, type DateRange } from '@/components/DateRangePicker';
import { useCajas, useCierres } from '@/hooks/useCaja';
import { useUsuarios } from '@/hooks/useUsuarios';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

export default function CierresPage() {
  return (
    <AuthGate roles={['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN']}>
      <AdminShell>
        <CierresScreen />
      </AdminShell>
    </AuthGate>
  );
}

function CierresScreen() {
  const ahora = new Date();
  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 29);
  hace30.setHours(0, 0, 0, 0);

  const [rango, setRango] = useState<DateRange>({ desde: hace30, hasta: ahora });
  const [cajaId, setCajaId] = useState<string>('');
  const [usuarioId, setUsuarioId] = useState<string>('');
  const [page, setPage] = useState(1);

  const { data: cajas = [] } = useCajas({ incluirInactivas: true });
  const { data: usuarios = [] } = useUsuarios({ incluirInactivos: true });

  const { data, isLoading, isFetching } = useCierres({
    desde: rango.desde.toISOString(),
    hasta: rango.hasta.toISOString(),
    cajaId: cajaId || undefined,
    usuarioId: usuarioId || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const cierres = data?.cierres ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desde = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(page * PAGE_SIZE, total);

  // Resumen del resultado actual (página visible). Sirve para auditar rápido.
  const resumen = cierres.reduce(
    (acc, c) => ({
      ventas: acc.ventas + BigInt(c.totalVentas),
      contado: acc.contado + BigInt(c.totalContadoEfectivo),
      diferencia: acc.diferencia + BigInt(c.diferenciaEfectivo),
    }),
    { ventas: 0n, contado: 0n, diferencia: 0n },
  );

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Calculator className="h-6 w-6 text-primary" />
            Histórico de cierres Z
          </h1>
          <p className="text-sm text-muted-foreground">
            {total} cierre{total !== 1 ? 's' : ''} en el rango seleccionado
          </p>
        </div>
        <Link
          href="/caja"
          className="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
        >
          Mi turno actual
        </Link>
      </header>

      {/* Filtros */}
      <div className="mb-4 grid gap-3 rounded-lg border bg-card p-3 lg:grid-cols-[1fr_220px_220px]">
        <DateRangePicker
          value={rango}
          onChange={(r) => {
            setRango(r);
            setPage(1);
          }}
        />
        <select
          value={cajaId}
          onChange={(e) => {
            setCajaId(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-input bg-background px-2 py-2 text-sm"
        >
          <option value="">Todas las cajas</option>
          {cajas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select
          value={usuarioId}
          onChange={(e) => {
            setUsuarioId(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-input bg-background px-2 py-2 text-sm"
        >
          <option value="">Todos los cajeros</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombreCompleto}
            </option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : cierres.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <Search className="mx-auto mb-2 h-8 w-8 opacity-30" />
          No hay cierres con esos filtros.
        </div>
      ) : (
        <div
          className={cn('overflow-hidden rounded-lg border bg-card', isFetching && 'opacity-60')}
        >
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Cerrada</th>
                <th className="px-3 py-2 text-left">Caja</th>
                <th className="px-3 py-2 text-left">Cajero/a</th>
                <th className="px-3 py-2 text-right">Ventas</th>
                <th className="px-3 py-2 text-right">Contado</th>
                <th className="px-3 py-2 text-right">Diferencia</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cierres.map((c) => {
                const dif = BigInt(c.diferenciaEfectivo);
                return (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs">
                      <p className="font-medium">{formatFechaHora(c.cerradaEn)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Abierta: {formatFechaHora(c.apertura.abiertaEn)}
                      </p>
                    </td>
                    <td className="px-3 py-2">{c.caja.nombre}</td>
                    <td className="px-3 py-2 text-xs">{c.usuario.nombreCompleto}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatGs(c.totalVentas)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {formatGs(c.totalContadoEfectivo)}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right font-mono font-semibold',
                        dif === 0n
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : dif > 0n
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-red-700 dark:text-red-300',
                      )}
                    >
                      {dif === 0n ? '✓ ' : dif > 0n ? '+ ' : ''}
                      {formatGs(dif)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/caja/cierres/${c.id}/imprimir`}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
                      >
                        <Printer className="h-3 w-3" /> Ticket Z
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/20 text-xs">
              <tr>
                <td colSpan={3} className="px-3 py-2 font-semibold">
                  Total página
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  {formatGs(resumen.ventas)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold">
                  {formatGs(resumen.contado)}
                </td>
                <td
                  className={cn(
                    'px-3 py-2 text-right font-mono font-bold',
                    resumen.diferencia === 0n
                      ? 'text-emerald-700'
                      : resumen.diferencia > 0n
                        ? 'text-amber-700'
                        : 'text-red-700',
                  )}
                >
                  {resumen.diferencia >= 0n ? '+' : ''}
                  {formatGs(resumen.diferencia)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Paginador */}
      {total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {desde}–{hasta} de {total}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
              className="rounded-md border border-input p-1.5 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-xs">
              Página <strong>{page}</strong> de {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              className="rounded-md border border-input p-1.5 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───── Helpers ─────

function formatGs(n: string | bigint | number): string {
  return `Gs. ${BigInt(n).toLocaleString('es-PY')}`;
}

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
