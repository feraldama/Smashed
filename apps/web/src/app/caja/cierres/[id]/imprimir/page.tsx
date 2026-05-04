'use client';

import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AuthGate, ROLES_OPERATIVOS } from '@/components/AuthGate';
import { type CierreDetalle, useCierre } from '@/hooks/useCaja';

/**
 * Ticket Z (cierre de caja) — formato térmico 80mm. El cajero llega acá
 * después de confirmar el cierre. Se imprime automáticamente al cargar.
 *
 * Contenido: empresa + sucursal + caja + cajero + fecha de apertura/cierre
 *  + monto inicial + ingresos por método de pago + monto contado + diferencia
 *  + conteo por denominación.
 */
export default function ImprimirCierrePage() {
  return (
    <AuthGate roles={ROLES_OPERATIVOS}>
      <ImprimirScreen />
    </AuthGate>
  );
}

function ImprimirScreen() {
  const { id } = useParams<{ id: string }>();
  const { data: cierre, isLoading, isError } = useCierre(id);

  // Auto-print al cargar (un pequeño delay para que termine el render)
  const [autoPrintDone, setAutoPrintDone] = useState(false);
  useEffect(() => {
    if (!cierre || autoPrintDone) return undefined;
    const t = setTimeout(() => {
      window.print();
      setAutoPrintDone(true);
    }, 600);
    return () => clearTimeout(t);
  }, [cierre, autoPrintDone]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !cierre) {
    return (
      <div className="mx-auto mt-8 max-w-md rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        No se pudo cargar el cierre.{' '}
        <Link href="/caja" className="underline">
          Volver a Caja
        </Link>
        .
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar — sólo visible en pantalla, oculta al imprimir */}
      <div className="no-print sticky top-0 z-10 border-b bg-card shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href="/caja"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a Caja
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      </div>

      <main className="print-area py-6 print:py-0">
        <TicketCierreZ cierre={cierre} />
      </main>

      {/* CSS de impresión: térmica 80mm */}
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          html,
          body {
            background: #fff !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
          }
          @page {
            size: 80mm auto;
            margin: 0;
          }
          .ticket-print {
            width: 80mm;
            padding: 2mm;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Layout del ticket
// ───────────────────────────────────────────────────────────────────────────

function TicketCierreZ({ cierre }: { cierre: CierreDetalle }) {
  const diferencia = BigInt(cierre.diferenciaEfectivo);
  const cuadre = diferencia === 0n ? 'CUADRA OK' : diferencia > 0n ? 'SOBRANTE' : 'FALTANTE';
  const totalesPorMetodo = Object.entries(cierre.totalesPorMetodo);
  const conteo = cierre.conteoEfectivo
    ? Object.entries(cierre.conteoEfectivo)
        .map(([d, c]) => ({ denom: Number(d), cant: c }))
        .filter((x) => x.cant > 0)
        .sort((a, b) => b.denom - a.denom)
    : [];

  return (
    <div
      className="ticket-print"
      style={{
        width: '76mm',
        margin: '0 auto',
        padding: '2mm',
        fontFamily: '"Courier New", "Courier", monospace',
        fontSize: '11px',
        lineHeight: 1.3,
        color: '#000',
        background: '#fff',
      }}
    >
      {/* Cabecera empresa */}
      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
        <p style={{ fontWeight: 'bold', fontSize: '13px', margin: 0 }}>
          {cierre.caja.sucursal.empresa.razonSocial}
        </p>
        <p style={{ margin: 0 }}>
          RUC {cierre.caja.sucursal.empresa.ruc}-{cierre.caja.sucursal.empresa.dv}
        </p>
        {cierre.caja.sucursal.direccion && (
          <p style={{ margin: 0 }}>{cierre.caja.sucursal.direccion}</p>
        )}
        <p style={{ margin: 0 }}>Suc. {cierre.caja.sucursal.nombre}</p>
      </div>

      <Divider />

      {/* Título */}
      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
        <p style={{ fontWeight: 'bold', fontSize: '13px', margin: 0 }}>CIERRE DE CAJA Z</p>
        <p style={{ margin: 0 }}>{cierre.caja.nombre}</p>
      </div>

      <Divider />

      {/* Datos del turno */}
      <Row label="Cajero/a:" value={cierre.usuario.nombreCompleto} />
      <Row label="Apertura:" value={formatFechaHora(cierre.apertura.abiertaEn)} />
      <Row label="Cierre:" value={formatFechaHora(cierre.cerradaEn)} />

      <Divider />

      {/* Montos básicos */}
      <Row label="Monto inicial:" value={formatGs(cierre.apertura.montoInicial)} bold />
      <Row label="Total ventas:" value={formatGs(cierre.totalVentas)} />

      <Divider />

      {/* Ingresos por método */}
      <p style={{ fontWeight: 'bold', margin: '4px 0 2px' }}>INGRESOS POR MÉTODO</p>
      {totalesPorMetodo.length === 0 ? (
        <p style={{ margin: 0, fontStyle: 'italic' }}>(sin ventas en el turno)</p>
      ) : (
        totalesPorMetodo.map(([metodo, monto]) => (
          <Row key={metodo} label={labelMetodo(metodo)} value={formatGs(monto)} />
        ))
      )}

      <Divider />

      {/* Cuadre de efectivo */}
      <p style={{ fontWeight: 'bold', margin: '4px 0 2px' }}>EFECTIVO</p>
      <Row label="Esperado en caja:" value={formatGs(cierre.totalEsperadoEfectivo)} />
      <Row label="Contado por cajero:" value={formatGs(cierre.totalContadoEfectivo)} bold />
      <Row
        label="Diferencia:"
        value={`${diferencia >= 0n ? '+' : ''}${formatGs(diferencia)}`}
        bold
      />
      <p
        style={{
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '13px',
          margin: '6px 0',
          padding: '4px',
          border: '2px solid #000',
        }}
      >
        {cuadre}
      </p>

      {/* Conteo por denominación */}
      {conteo.length > 0 && (
        <>
          <Divider />
          <p style={{ fontWeight: 'bold', margin: '4px 0 2px' }}>CONTEO DE DENOMINACIONES</p>
          {conteo.map(({ denom, cant }) => (
            <Row
              key={denom}
              label={`${cant} × Gs. ${denom.toLocaleString('es-PY')}`}
              value={formatGs(BigInt(denom) * BigInt(cant))}
            />
          ))}
        </>
      )}

      {/* Notas */}
      {cierre.notas && (
        <>
          <Divider />
          <p style={{ fontWeight: 'bold', margin: '4px 0 2px' }}>OBSERVACIONES</p>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{cierre.notas}</p>
        </>
      )}

      <Divider />

      {/* Pie */}
      <div style={{ textAlign: 'center', marginTop: '6px' }}>
        <p style={{ margin: 0, fontSize: '10px' }}>
          Documento interno de control. No tiene validez fiscal.
        </p>
        <p style={{ margin: '2px 0 0', fontSize: '10px' }}>Cierre #{cierre.id.slice(-8)}</p>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────────────

function Divider() {
  return <p style={{ margin: '3px 0', borderTop: '1px dashed #000' }}>{' '}</p>;
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '8px',
        fontWeight: bold ? 'bold' : 'normal',
      }}
    >
      <span>{label}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

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

function labelMetodo(m: string): string {
  return m
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
