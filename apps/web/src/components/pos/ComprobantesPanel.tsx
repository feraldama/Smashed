'use client';

import { ExternalLink, FileText, Loader2, Printer, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { toast } from '@/components/Toast';
import {
  type ComprobanteDetalle,
  type ComprobanteResumen,
  useComprobantes,
} from '@/hooks/useComprobantes';
import { ApiError, api } from '@/lib/api';
import { imprimirComprobante } from '@/lib/imprimir';
import { cn, formatGs } from '@/lib/utils';

/**
 * Panel lateral del POS para ver y reimprimir los comprobantes del día sin salir
 * del kiosko. El listado completo (con filtros por fecha, anulación, etc.) vive en
 * el área admin /comprobantes; acá damos lo justo para que el cajero confirme lo
 * vendido y reimprima un ticket/factura recién emitida.
 *
 * La reimpresión pide el detalle del comprobante on-demand (el listado sólo trae
 * el resumen) y reusa `imprimirComprobante`, el mismo flujo de impresión directa
 * que usa el cobro.
 */
export function ComprobantesPanel({ onClose }: { onClose: () => void }) {
  // Filtramos por el día de hoy (formato YYYY-MM-DD, igual que el listado admin).
  const hoy = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const { data: comprobantes = [], isLoading } = useComprobantes({ desde: hoy, pageSize: 100 });

  const [busqueda, setBusqueda] = useState('');
  const [reimprimiendoId, setReimprimiendoId] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return comprobantes;
    return comprobantes.filter(
      (c) =>
        c.numeroDocumento.toLowerCase().includes(q) ||
        (c.cliente?.razonSocial ?? '').toLowerCase().includes(q),
    );
  }, [comprobantes, busqueda]);

  async function handleReimprimir(id: string) {
    setReimprimiendoId(id);
    try {
      const { comprobante } = await api<{ comprobante: ComprobanteDetalle }>(`/comprobantes/${id}`);
      imprimirComprobante(comprobante);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cargar el comprobante');
    } finally {
      setReimprimiendoId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <FileText className="h-4 w-4" /> Comprobantes de hoy
          </h2>
          <button type="button" onClick={onClose} className="rounded-sm p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nº o cliente…"
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <FileText className="h-10 w-10 opacity-30" />
              <p>{busqueda ? 'Sin resultados' : 'Sin comprobantes hoy'}</p>
            </div>
          ) : (
            <ul className="divide-y">
              {filtrados.map((c) => (
                <ComprobanteRow
                  key={c.id}
                  comp={c}
                  reimprimiendo={reimprimiendoId === c.id}
                  onReimprimir={() => {
                    void handleReimprimir(c.id);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ComprobanteRow({
  comp,
  reimprimiendo,
  onReimprimir,
}: {
  comp: ComprobanteResumen;
  reimprimiendo: boolean;
  onReimprimir: () => void;
}) {
  const anulado = comp.estado === 'ANULADO';
  return (
    <li className={cn('p-3', anulado && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold">{comp.numeroDocumento}</span>
            <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">
              {labelTipo(comp.tipoDocumento)}
            </span>
            {anulado && (
              <span className="rounded-full border border-red-300 bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-900">
                Anulado
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm font-medium">
            {comp.cliente?.razonSocial ?? 'Consumidor final'}
          </p>
          <p className="text-[11px] text-muted-foreground">{formatHora(comp.fechaEmision)}</p>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums">
          {formatGs(BigInt(comp.total))}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onReimprimir}
          disabled={reimprimiendo}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {reimprimiendo ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Printer className="h-3.5 w-3.5" />
          )}
          Reimprimir
        </button>
        <Link
          href={`/comprobantes/${comp.id}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
          title="Ver detalle (abre en otra pestaña)"
        >
          Ver <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </li>
  );
}

function labelTipo(t: string): string {
  switch (t) {
    case 'TICKET':
      return 'Ticket';
    case 'FACTURA':
      return 'Factura';
    case 'NOTA_CREDITO':
      return 'N. crédito';
    case 'NOTA_DEBITO':
      return 'N. débito';
    default:
      return t;
  }
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}
