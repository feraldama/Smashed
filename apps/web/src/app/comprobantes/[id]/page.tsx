'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Printer,
  RefreshCw,
  Send,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { CancelarSifenModal } from '@/components/CancelarSifenModal';
import { EstadoSifenBadge } from '@/components/EstadoSifenBadge';
import { toast } from '@/components/Toast';
import {
  type ComprobanteDetalle,
  type EventoSifen,
  useComprobante,
  useConsultarEstadoSifen,
  useEnviarSifen,
} from '@/hooks/useComprobantes';
import { ApiError } from '@/lib/api';

export default function ComprobanteDetallePage() {
  return (
    <AuthGate>
      <AdminShell>
        <ComprobanteDetalleScreen />
      </AdminShell>
    </AuthGate>
  );
}

function ComprobanteDetalleScreen() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: comp, isLoading, isError } = useComprobante(id);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !comp) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
        No se pudo cargar el comprobante. Volvé al{' '}
        <Link href="/comprobantes" className="underline">
          listado
        </Link>
        .
      </div>
    );
  }

  return <DetalleContent comp={comp} />;
}

function DetalleContent({ comp }: { comp: ComprobanteDetalle }) {
  const [showCancelar, setShowCancelar] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/comprobantes"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al listado
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {labelTipo(comp.tipoDocumento)}
          </p>
          <h1 className="font-mono text-3xl font-bold tracking-tight">{comp.numeroDocumento}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <EstadoSifenBadge estado={comp.estadoSifen} size="md" />
            {comp.estado === 'ANULADO' && (
              <span className="rounded-full border border-red-300 bg-red-100 px-2 py-1 text-xs font-bold uppercase text-red-900 dark:bg-red-950/40 dark:text-red-200">
                Anulado
              </span>
            )}
          </div>
        </div>

        <SifenAcciones comp={comp} onPedirCancelacion={() => setShowCancelar(true)} />
      </header>

      {comp.motivoRechazoSifen && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">SIFEN rechazó el envío</p>
              <p className="text-xs">{comp.motivoRechazoSifen}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Datos fiscales */}
        <section className="rounded-lg border bg-card lg:col-span-2">
          <h2 className="border-b px-4 py-2 text-sm font-bold uppercase tracking-wide">
            Detalle fiscal
          </h2>
          <div className="grid grid-cols-2 gap-4 p-4 text-sm md:grid-cols-3">
            <Field label="Fecha emisión" value={formatFecha(comp.fechaEmision)} />
            <Field
              label="Condición"
              value={comp.condicionVenta === 'CONTADO' ? 'Contado' : 'Crédito'}
            />
            <Field label="Sucursal" value={comp.sucursal.nombre} />
            <Field
              label="Receptor"
              value={
                <>
                  <p className="font-semibold">{comp.receptorRazonSocial}</p>
                  {comp.receptorRuc && (
                    <p className="text-xs text-muted-foreground">
                      RUC {comp.receptorRuc}-{comp.receptorDv}
                    </p>
                  )}
                  {comp.receptorDocumento && (
                    <p className="text-xs text-muted-foreground">CI {comp.receptorDocumento}</p>
                  )}
                </>
              }
            />
            <Field label="Emitido por" value={comp.emitidoPor.nombreCompleto} />
            <Field label="Timbrado" value={comp.timbrado.numero} />
            {comp.cdc && (
              <Field
                label="CDC"
                value={<span className="font-mono text-xs break-all">{comp.cdc}</span>}
                full
              />
            )}
          </div>

          {/* Items */}
          <div className="border-t">
            <h3 className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Items ({comp.items.length})
            </h3>
            <table className="w-full text-sm">
              <thead className="border-y bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-1.5 text-left">Descripción</th>
                  <th className="px-2 py-1.5 text-right">Cant.</th>
                  <th className="px-2 py-1.5 text-right">P. Unit</th>
                  <th className="px-2 py-1.5 text-center">IVA</th>
                  <th className="px-4 py-1.5 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {comp.items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-4 py-1.5">
                      {it.codigo && (
                        <span className="text-xs text-muted-foreground">{it.codigo} · </span>
                      )}
                      {it.descripcion}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{it.cantidad}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {formatGs(BigInt(it.precioUnitario))}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
                        {labelIva(it.tasaIva)}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 text-right font-semibold tabular-nums">
                      {formatGs(BigInt(it.subtotal))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totales */}
          <div className="grid grid-cols-2 gap-2 border-t bg-muted/20 px-4 py-3 text-sm md:grid-cols-4">
            {BigInt(comp.subtotalExentas) > 0n && (
              <Total label="Exento" value={comp.subtotalExentas} />
            )}
            {BigInt(comp.subtotalIva5) > 0n && (
              <Total label="Base IVA 5%" value={comp.subtotalIva5} />
            )}
            {BigInt(comp.subtotalIva10) > 0n && (
              <Total label="Base IVA 10%" value={comp.subtotalIva10} />
            )}
            {BigInt(comp.totalIva5) > 0n && <Total label="IVA 5%" value={comp.totalIva5} />}
            {BigInt(comp.totalIva10) > 0n && <Total label="IVA 10%" value={comp.totalIva10} />}
            <div className="col-span-2 flex flex-col items-end justify-end md:col-span-1 md:col-start-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="text-xl font-bold tabular-nums">{formatGs(BigInt(comp.total))}</p>
            </div>
          </div>

          {/* Pagos */}
          <div className="border-t px-4 py-3">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Pagos ({comp.pagos.length})
            </h3>
            <ul className="space-y-1 text-sm">
              {comp.pagos.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span>
                    {labelMetodo(p.metodo)}{' '}
                    {p.referencia && (
                      <span className="text-xs text-muted-foreground">· {p.referencia}</span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums">{formatGs(BigInt(p.monto))}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* SIFEN side panel */}
        <aside className="space-y-4">
          {comp.qrUrl && (
            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">QR / KuDE</h2>
              <a
                href={comp.qrUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 break-all text-xs text-primary hover:underline"
              >
                Abrir en SIFEN <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </section>
          )}

          <section className="rounded-lg border bg-card">
            <h2 className="border-b px-4 py-2 text-sm font-bold uppercase tracking-wide">
              Eventos SIFEN ({comp.eventosSifen.length})
            </h2>
            {comp.eventosSifen.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">Sin eventos registrados.</p>
            ) : (
              <ul className="divide-y">
                {comp.eventosSifen.map((ev) => (
                  <EventoItem key={ev.id} ev={ev} />
                ))}
              </ul>
            )}
          </section>

          {comp.xmlFirmado && <XmlViewer xml={comp.xmlFirmado} />}
        </aside>
      </div>

      {showCancelar && (
        <CancelarSifenModal
          comprobanteId={comp.id}
          numeroDocumento={comp.numeroDocumento}
          onClose={() => setShowCancelar(false)}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Acciones SIFEN
// ───────────────────────────────────────────────────────────────────────────

function SifenAcciones({
  comp,
  onPedirCancelacion,
}: {
  comp: ComprobanteDetalle;
  onPedirCancelacion: () => void;
}) {
  const enviar = useEnviarSifen();
  const consultar = useConsultarEstadoSifen(comp.id);

  const isTicket = comp.tipoDocumento === 'TICKET';
  const puedeEnviar =
    !isTicket &&
    comp.estado !== 'ANULADO' &&
    (comp.estadoSifen === 'NO_ENVIADO' ||
      comp.estadoSifen === 'PENDIENTE' ||
      comp.estadoSifen === 'RECHAZADO');
  const puedeCancelar = comp.estadoSifen === 'APROBADO';
  const puedeConsultar = Boolean(comp.cdc);

  async function handleEnviar() {
    try {
      const res = await enviar.mutateAsync(comp.id);
      if (res.estadoSifen === 'APROBADO') {
        toast.success(`SIFEN aprobó · CDC ${res.cdc.slice(0, 8)}…`);
      } else if (res.estadoSifen === 'PENDIENTE') {
        toast.success('Comprobante encolado en SIFEN — pendiente de aprobación');
      } else {
        toast.error(`SIFEN rechazó: ${res.mensaje}`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al enviar');
    }
  }

  async function handleConsultar() {
    try {
      const res = await consultar.refetch();
      if (res.error) {
        toast.error(res.error instanceof ApiError ? res.error.message : 'Error al consultar SIFEN');
        return;
      }
      const data = res.data;
      if (!data) return;
      toast.success(`SIFEN: ${data.estadoSifen} — ${data.mensaje}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al consultar');
    }
  }

  if (isTicket) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/comprobantes/${comp.id}/imprimir`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Printer className="h-4 w-4" /> Imprimir
        </Link>
        <span className="rounded-md border border-muted-foreground/20 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Los tickets no se envían a SIFEN
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={`/comprobantes/${comp.id}/imprimir`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
      >
        <Printer className="h-4 w-4" /> Imprimir
      </Link>
      {puedeEnviar && (
        <button
          type="button"
          onClick={handleEnviar}
          disabled={enviar.isPending}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          {enviar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {comp.estadoSifen === 'NO_ENVIADO' ? 'Enviar a SIFEN' : 'Reintentar envío'}
        </button>
      )}
      {puedeConsultar && (
        <button
          type="button"
          onClick={handleConsultar}
          disabled={consultar.isFetching}
          className="flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
        >
          {consultar.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Consultar estado
        </button>
      )}
      {puedeCancelar && (
        <button
          type="button"
          onClick={onPedirCancelacion}
          className="flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-200"
        >
          <Ban className="h-4 w-4" /> Cancelar en SIFEN
        </button>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Subcomponentes
// ───────────────────────────────────────────────────────────────────────────

function Field({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'md:col-span-3' : undefined}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div>{value}</div>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{formatGs(BigInt(value))}</p>
    </div>
  );
}

function EventoItem({ ev }: { ev: EventoSifen }) {
  const [open, setOpen] = useState(false);
  const colorEstado =
    ev.estado === 'APROBADO'
      ? 'text-emerald-700 dark:text-emerald-300'
      : ev.estado === 'RECHAZADO' || ev.estado === 'ERROR_TRANSPORTE'
        ? 'text-red-700 dark:text-red-300'
        : ev.estado === 'ENVIANDO'
          ? 'text-amber-700 dark:text-amber-300'
          : 'text-muted-foreground';

  return (
    <li className="px-3 py-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 text-left"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{ev.tipo}</span>
            <span className={`text-[10px] font-bold uppercase ${colorEstado}`}>{ev.estado}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{formatFecha(ev.enviadoEn)}</p>
          {ev.motivo && <p className="mt-1 text-[11px] line-clamp-2">{ev.motivo}</p>}
        </div>
      </button>
      {open && (
        <div className="mt-2 space-y-2 pl-5">
          {ev.respondidoEn && (
            <p className="text-[11px]">
              <span className="font-semibold text-muted-foreground">Respondido:</span>{' '}
              {formatFecha(ev.respondidoEn)}
            </p>
          )}
          {ev.xmlRespuesta && (
            <details>
              <summary className="cursor-pointer text-[11px] font-semibold text-primary">
                Ver XML respuesta DNIT
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/50 p-2 text-[10px]">
                {ev.xmlRespuesta}
              </pre>
            </details>
          )}
        </div>
      )}
    </li>
  );
}

function XmlViewer({ xml }: { xml: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-b px-4 py-2 text-left"
      >
        <span className="text-sm font-bold uppercase tracking-wide">XML firmado</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <pre className="max-h-96 overflow-auto rounded-b-lg bg-muted/40 p-3 text-[10px]">{xml}</pre>
      )}
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────────────

function labelTipo(t: string): string {
  switch (t) {
    case 'TICKET':
      return 'Ticket';
    case 'FACTURA':
      return 'Factura electrónica';
    case 'NOTA_CREDITO':
      return 'Nota de crédito electrónica';
    case 'NOTA_DEBITO':
      return 'Nota de débito electrónica';
    case 'AUTOFACTURA':
      return 'Autofactura electrónica';
    case 'NOTA_REMISION':
      return 'Nota de remisión electrónica';
    default:
      return t;
  }
}

function labelIva(t: string): string {
  switch (t) {
    case 'IVA_10':
      return '10%';
    case 'IVA_5':
      return '5%';
    case 'IVA_0':
      return '0%';
    case 'EXENTO':
      return 'EX';
    default:
      return t;
  }
}

function labelMetodo(m: string): string {
  return m
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
