'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calculator,
  Loader2,
  ReceiptText,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { AbrirCajaModal } from '@/components/caja/AbrirCajaModal';
import { CerrarCajaModal } from '@/components/caja/CerrarCajaModal';
import {
  type AperturaDetalle,
  type MovimientoApertura,
  useApertura,
  useCajas,
  useMiAperturaActiva,
} from '@/hooks/useCaja';
import { cn } from '@/lib/utils';

export default function CajaPage() {
  return (
    <AuthGate>
      <AdminShell>
        <CajaScreen />
      </AdminShell>
    </AuthGate>
  );
}

function CajaScreen() {
  const { data: cajas = [], isLoading: cajasLoading } = useCajas();
  const { data: miApertura, isLoading: aperturaLoading } = useMiAperturaActiva();
  const { data: aperturaDetalle } = useApertura(miApertura?.id ?? null);

  const [showAbrir, setShowAbrir] = useState(false);
  const [showCerrar, setShowCerrar] = useState(false);

  if (cajasLoading || aperturaLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Caja</h1>
          <p className="text-sm text-muted-foreground">
            Aperturas, movimientos y cierres Z del turno
          </p>
        </div>
        {!miApertura ? (
          <button
            type="button"
            onClick={() => setShowAbrir(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            <Wallet className="h-4 w-4" /> Abrir caja
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowCerrar(true)}
            className="flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-200"
          >
            <Calculator className="h-4 w-4" /> Cerrar caja Z
          </button>
        )}
      </header>

      {!miApertura ? (
        <SinCajaAbierta cajas={cajas} onAbrir={() => setShowAbrir(true)} />
      ) : aperturaDetalle ? (
        <CajaAbiertaPanel apertura={aperturaDetalle} />
      ) : (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Modales */}
      {showAbrir && (
        <AbrirCajaModal
          cajasDisponibles={cajas.filter((c) => c.estado === 'CERRADA')}
          onClose={() => setShowAbrir(false)}
        />
      )}
      {showCerrar && aperturaDetalle && (
        <CerrarCajaModal apertura={aperturaDetalle} onClose={() => setShowCerrar(false)} />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Estado: sin caja abierta
// ───────────────────────────────────────────────────────────────────────────

function SinCajaAbierta({
  cajas,
  onAbrir,
}: {
  cajas: ReturnType<typeof useCajas>['data'];
  onAbrir: () => void;
}) {
  const list = cajas ?? [];
  const cerradas = list.filter((c) => c.estado === 'CERRADA');
  const abiertasPorOtros = list.filter((c) => c.estado === 'ABIERTA');

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-center dark:bg-amber-950/30">
        <Wallet className="mx-auto mb-3 h-10 w-10 text-amber-600 dark:text-amber-400" />
        <h2 className="text-lg font-bold">No tenés caja abierta</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Para vender o emitir comprobantes necesitás abrir un turno primero.
        </p>
        {cerradas.length > 0 ? (
          <button
            type="button"
            onClick={onAbrir}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            <Wallet className="h-4 w-4" /> Abrir caja
          </button>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            Todas las cajas físicas de esta sucursal están ocupadas.
          </p>
        )}
      </div>

      {abiertasPorOtros.length > 0 && (
        <div className="rounded-md border bg-card p-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Cajas abiertas por otros usuarios
          </h3>
          <ul className="space-y-2 text-sm">
            {abiertasPorOtros.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md border p-2">
                <div>
                  <p className="font-medium">{c.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.sesionActiva?.usuario.nombreCompleto} · desde{' '}
                    {c.sesionActiva && formatHora(c.sesionActiva.abiertaEn)}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  ABIERTA
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Estado: caja abierta — panel de turno
// ───────────────────────────────────────────────────────────────────────────

function CajaAbiertaPanel({ apertura }: { apertura: AperturaDetalle }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Card resumen */}
        <section className="rounded-lg border bg-card p-4 lg:col-span-1">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            <Wallet className="h-4 w-4" /> Turno actual
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Caja</dt>
              <dd className="font-semibold">{apertura.caja.nombre}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Cajero/a
              </dt>
              <dd>{apertura.usuario.nombreCompleto}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Abierta</dt>
              <dd>{formatFecha(apertura.abiertaEn)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Monto inicial
              </dt>
              <dd className="font-semibold tabular-nums">{formatGs(apertura.montoInicial)}</dd>
            </div>
          </dl>
        </section>

        {/* Card totales */}
        <section className="rounded-lg border bg-card p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Resumen del turno</h2>
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <Total
              label="Total ventas"
              value={apertura.totales.totalVentas}
              icon={<ReceiptText className="h-3.5 w-3.5" />}
              highlight
            />
            <Total
              label="Esperado en efectivo"
              value={apertura.totales.totalEsperadoEfectivo}
              icon={<Wallet className="h-3.5 w-3.5" />}
            />
            <Total label="Movimientos" value={String(apertura.movimientos.length)} raw />
          </div>

          {Object.keys(apertura.totales.totalesPorMetodo).length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Por método de pago
              </h3>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {Object.entries(apertura.totales.totalesPorMetodo).map(([metodo, monto]) => (
                  <div
                    key={metodo}
                    className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 p-2"
                  >
                    <span className="text-xs text-muted-foreground">{labelMetodo(metodo)}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatGs(monto)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Movimientos */}
      <section className="rounded-lg border bg-card">
        <h2 className="border-b px-4 py-2 text-sm font-bold uppercase tracking-wide">
          Movimientos ({apertura.movimientos.length})
        </h2>
        {apertura.movimientos.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Sin movimientos todavía. La apertura ya está registrada como movimiento inicial.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Hora</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Concepto</th>
                <th className="px-3 py-2 text-left">Método</th>
                <th className="px-3 py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {apertura.movimientos.map((m) => (
                <MovimientoRow key={m.id} mov={m} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function MovimientoRow({ mov }: { mov: MovimientoApertura }) {
  const isSalida = mov.tipo === 'EGRESO' || mov.tipo === 'RETIRO_PARCIAL' || mov.tipo === 'CIERRE';
  return (
    <tr className="hover:bg-muted/20">
      <td className="px-3 py-2 text-xs text-muted-foreground">{formatHora(mov.createdAt)}</td>
      <td className="px-3 py-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
            mov.tipo === 'VENTA' &&
              'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
            mov.tipo === 'APERTURA' &&
              'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200',
            (mov.tipo === 'EGRESO' || mov.tipo === 'RETIRO_PARCIAL') &&
              'bg-red-100 text-red-900 dark:bg-red-950/40 dark:text-red-200',
            mov.tipo === 'INGRESO_EXTRA' &&
              'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
          )}
        >
          {isSalida ? (
            <ArrowDownCircle className="h-3 w-3" />
          ) : (
            <ArrowUpCircle className="h-3 w-3" />
          )}
          {mov.tipo.replace(/_/g, ' ')}
        </span>
      </td>
      <td className="px-3 py-2">{mov.concepto ?? '—'}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {mov.metodoPago ? labelMetodo(mov.metodoPago) : '—'}
      </td>
      <td
        className={cn(
          'px-3 py-2 text-right font-semibold tabular-nums',
          isSalida && 'text-red-700 dark:text-red-300',
        )}
      >
        {isSalida ? '−' : ''}
        {formatGs(mov.monto)}
      </td>
    </tr>
  );
}

function Total({
  label,
  value,
  icon,
  highlight,
  raw,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: boolean;
  raw?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        highlight ? 'border-primary/30 bg-primary/5' : 'bg-muted/20',
      )}
    >
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums">{raw ? value : formatGs(value)}</p>
    </div>
  );
}

function labelMetodo(m: string): string {
  return m
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatGs(n: string | bigint | number): string {
  return `Gs. ${BigInt(n).toLocaleString('es-PY')}`;
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

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PY', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
