'use client';

import { ArrowLeft, CheckCircle2, Loader2, Lock, Unlock, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { AuthGate } from '@/components/AuthGate';
import {
  useAbrirCaja,
  useApertura,
  useAperturaActiva,
  useCajas,
  useCerrarCaja,
} from '@/hooks/useCaja';
import { ApiError } from '@/lib/api';
import { cn, formatGs } from '@/lib/utils';

export default function CajaPage() {
  return (
    <AuthGate>
      <CajaScreen />
    </AuthGate>
  );
}

function CajaScreen() {
  const { data: apertura, isLoading: cargandoApertura } = useAperturaActiva();

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-md border hover:bg-accent"
              aria-label="Volver al POS"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl font-bold tracking-tight">Caja</h1>
          </div>
        </div>
      </header>

      <section className="container py-6">
        {cargandoApertura ? (
          <Loader />
        ) : apertura ? (
          <CerrarCajaPanel aperturaId={apertura.id} />
        ) : (
          <AbrirCajaPanel />
        )}
      </section>
    </main>
  );
}

function Loader() {
  return (
    <div className="flex h-40 items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  ABRIR CAJA
// ───────────────────────────────────────────────────────────────────────────

function AbrirCajaPanel() {
  const cajasQ = useCajas();
  const abrir = useAbrirCaja();
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [montoInicial, setMontoInicial] = useState('');
  const [notas, setNotas] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (cajasQ.isLoading) return <Loader />;

  const cajas = cajasQ.data ?? [];
  const disponibles = cajas.filter((c) => c.estado === 'CERRADA');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!seleccionada) {
      setErrorMsg('Seleccioná una caja');
      return;
    }
    const monto = Number.parseInt(montoInicial.replace(/[^\d]/g, ''), 10);
    if (Number.isNaN(monto) || monto < 0) {
      setErrorMsg('Monto inválido');
      return;
    }
    try {
      await abrir.mutateAsync({
        cajaId: seleccionada,
        montoInicial: monto,
        notas: notas || undefined,
      });
      window.location.href = '/';
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Error al abrir caja');
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="flex items-center gap-2 font-semibold">
          <Wallet className="h-4 w-4" /> No tenés caja abierta
        </p>
        <p className="mt-1 text-xs">
          Para empezar a vender, seleccioná una caja y registrá el monto inicial.
        </p>
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Cajas disponibles
      </h2>

      {disponibles.length === 0 && (
        <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No hay cajas disponibles en esta sucursal. Las {cajas.length} caja(s) ya están abiertas.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {disponibles.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSeleccionada(c.id)}
            className={cn(
              'flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-all',
              'hover:border-primary hover:bg-accent',
              seleccionada === c.id && 'border-primary bg-primary/5 ring-2 ring-primary/30',
            )}
          >
            <span className="font-semibold">{c.nombre}</span>
            {c.puntoExpedicion && (
              <span className="text-xs text-muted-foreground">
                Pto. expedición {c.puntoExpedicion.codigo}
                {c.puntoExpedicion.descripcion ? ` · ${c.puntoExpedicion.descripcion}` : ''}
              </span>
            )}
          </button>
        ))}
      </div>

      {seleccionada && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-lg border bg-card p-5">
          <div>
            <label htmlFor="monto" className="text-sm font-medium">
              Monto inicial (efectivo en caja)
            </label>
            <input
              id="monto"
              type="text"
              inputMode="numeric"
              autoFocus
              value={montoInicial}
              onChange={(e) => setMontoInicial(e.target.value)}
              placeholder="100000"
              className={cn(
                'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-lg shadow-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            />
            {montoInicial &&
              !Number.isNaN(Number.parseInt(montoInicial.replace(/[^\d]/g, ''), 10)) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatGs(Number.parseInt(montoInicial.replace(/[^\d]/g, ''), 10))}
                </p>
              )}
          </div>

          <div>
            <label htmlFor="notas" className="text-sm font-medium">
              Notas (opcional)
            </label>
            <input
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Inicio de turno tarde"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          {errorMsg && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={abrir.isPending}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow',
              'hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed',
            )}
          >
            {abrir.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Unlock className="h-4 w-4" />
            )}
            Abrir caja
          </button>
        </form>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  CERRAR CAJA
// ───────────────────────────────────────────────────────────────────────────

function CerrarCajaPanel({ aperturaId }: { aperturaId: string }) {
  const aperturaQ = useApertura(aperturaId);
  const cerrar = useCerrarCaja();
  const [contado, setContado] = useState('');
  const [notas, setNotas] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cerrado, setCerrado] = useState<{
    diferencia: string;
    esperado: string;
  } | null>(null);

  if (aperturaQ.isLoading) return <Loader />;
  if (!aperturaQ.data)
    return <p className="text-sm text-muted-foreground">Apertura no encontrada</p>;

  const apertura = aperturaQ.data;
  const esperado = Number(apertura.totales.totalEsperadoEfectivo);
  const contadoNum = Number.parseInt(contado.replace(/[^\d]/g, ''), 10);
  const diferenciaPreview = !Number.isNaN(contadoNum) ? contadoNum - esperado : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (Number.isNaN(contadoNum) || contadoNum < 0) {
      setErrorMsg('Ingresá el total contado');
      return;
    }
    try {
      const res = await cerrar.mutateAsync({
        aperturaId,
        totalContadoEfectivo: contadoNum,
        notas: notas || undefined,
      });
      setCerrado({
        diferencia: res.cierre.diferenciaEfectivo,
        esperado: res.cierre.totalEsperadoEfectivo,
      });
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Error al cerrar caja');
    }
  }

  if (cerrado) {
    const dif = Number(cerrado.diferencia);
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        </div>
        <h2 className="text-lg font-semibold">Caja cerrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Esperado: <span className="font-mono font-semibold">{formatGs(cerrado.esperado)}</span>
        </p>
        <p className="text-sm">
          Diferencia:{' '}
          <span
            className={cn(
              'font-mono font-bold',
              dif === 0 && 'text-emerald-600',
              dif > 0 && 'text-blue-600',
              dif < 0 && 'text-destructive',
            )}
          >
            {dif > 0 ? '+' : ''}
            {formatGs(dif)}
          </span>
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Volver al POS
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-3xl gap-6 lg:grid-cols-2">
      {/* Resumen */}
      <div className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Sesión actual
        </h2>
        <p className="mt-1 text-lg font-semibold">{apertura.caja.nombre}</p>
        <p className="text-xs text-muted-foreground">
          Abierta {new Date(apertura.abiertaEn).toLocaleString('es-PY')}
        </p>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Monto inicial</dt>
            <dd className="font-mono">{formatGs(apertura.montoInicial)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Movimientos</dt>
            <dd>{apertura.movimientos.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Total ventas</dt>
            <dd className="font-mono">{formatGs(apertura.totales.totalVentas)}</dd>
          </div>
          <div className="flex justify-between border-t pt-2">
            <dt className="font-semibold">Esperado en efectivo</dt>
            <dd className="font-mono font-bold text-primary">
              {formatGs(apertura.totales.totalEsperadoEfectivo)}
            </dd>
          </div>
        </dl>

        {Object.keys(apertura.totales.totalesPorMetodo).length > 0 && (
          <div className="mt-4 rounded-md bg-muted/40 p-3 text-xs">
            <p className="mb-1 font-semibold text-muted-foreground">Ventas por método</p>
            <ul className="space-y-0.5">
              {Object.entries(apertura.totales.totalesPorMetodo).map(([metodo, monto]) => (
                <li key={metodo} className="flex justify-between">
                  <span>{metodo.replace(/_/g, ' ')}</span>
                  <span className="font-mono">{formatGs(monto)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Cierre Z
        </h2>

        <div>
          <label htmlFor="contado" className="text-sm font-medium">
            Total contado en efectivo
          </label>
          <input
            id="contado"
            type="text"
            inputMode="numeric"
            autoFocus
            value={contado}
            onChange={(e) => setContado(e.target.value)}
            placeholder={String(esperado)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-lg shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {!Number.isNaN(contadoNum) && contado.length > 0 && (
            <p
              className={cn(
                'mt-1 text-xs font-mono',
                diferenciaPreview === 0 && 'text-emerald-600',
                diferenciaPreview > 0 && 'text-blue-600',
                diferenciaPreview < 0 && 'text-destructive',
              )}
            >
              Diferencia: {diferenciaPreview > 0 ? '+' : ''}
              {formatGs(diferenciaPreview)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="notas-cierre" className="text-sm font-medium">
            Notas (opcional)
          </label>
          <textarea
            id="notas-cierre"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Observaciones del cierre..."
          />
        </div>

        {errorMsg && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={cerrar.isPending}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow',
            'hover:bg-destructive/90 disabled:opacity-60',
          )}
        >
          {cerrar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          Cerrar caja
        </button>
      </form>
    </div>
  );
}
