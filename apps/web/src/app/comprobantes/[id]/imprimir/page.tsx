'use client';

import { ArrowLeft, Loader2, Printer, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AuthGate, ROLES_ENTREGAS } from '@/components/AuthGate';
import { FacturaA4 } from '@/components/imprimir/FacturaA4';
import { TicketTermico } from '@/components/imprimir/TicketTermico';
import { type ComprobanteDetalle, useComprobante } from '@/hooks/useComprobantes';

type Formato = 'ticket' | 'factura';

export default function ImprimirComprobantePage() {
  return (
    <AuthGate roles={ROLES_ENTREGAS}>
      <ImprimirScreen />
    </AuthGate>
  );
}

function ImprimirScreen() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const formatoQuery = search.get('formato') as Formato | null;

  const { data: comp, isLoading, isError } = useComprobante(id);

  // Default: ticket para TICKET, factura para FACTURA y notas. Override con ?formato=...
  const [formato, setFormato] = useState<Formato>('ticket');
  useEffect(() => {
    if (formatoQuery === 'ticket' || formatoQuery === 'factura') {
      setFormato(formatoQuery);
    } else if (comp) {
      setFormato(comp.tipoDocumento === 'TICKET' ? 'ticket' : 'factura');
    }
  }, [comp, formatoQuery]);

  // Auto-print al cargar (con un pequeño delay para que termine el render del QR)
  const [autoPrintDone, setAutoPrintDone] = useState(false);
  useEffect(() => {
    if (!comp || autoPrintDone || search.has('preview')) return undefined;
    const t = setTimeout(() => {
      window.print();
      setAutoPrintDone(true);
    }, 600);
    return () => clearTimeout(t);
  }, [comp, autoPrintDone, search]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !comp) {
    return (
      <div className="mx-auto mt-8 max-w-md rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        No se pudo cargar el comprobante.{' '}
        <Link href="/comprobantes" className="underline">
          Volver al listado
        </Link>
        .
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar — sólo visible en pantalla, oculta al imprimir */}
      <div className="no-print sticky top-0 z-10 border-b bg-card shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href={`/comprobantes/${id}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Volver al detalle
          </Link>
          <div className="flex items-center gap-2">
            <FormatoSelector formato={formato} onChange={setFormato} />
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
            >
              <Printer className="h-4 w-4" /> Imprimir
            </button>
          </div>
        </div>
      </div>

      {/* Contenido imprimible */}
      <main className="print-area py-6 print:py-0">
        <Layout comp={comp} formato={formato} />
      </main>

      {/* CSS de impresión: ajusta @page según formato seleccionado */}
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
        }
        @media print {
          ${formato === 'ticket'
            ? `@page { size: 80mm auto; margin: 0; }
               .ticket-print { width: 80mm; padding: 2mm; margin: 0; }`
            : `@page { size: A4; margin: 0; }
               .factura-print { width: 210mm; min-height: 297mm; margin: 0; padding: 15mm; }`}
        }
      `}</style>
    </div>
  );
}

function Layout({ comp, formato }: { comp: ComprobanteDetalle; formato: Formato }) {
  if (formato === 'ticket') return <TicketTermico comp={comp} />;
  return <FacturaA4 comp={comp} />;
}

function FormatoSelector({
  formato,
  onChange,
}: {
  formato: Formato;
  onChange: (f: Formato) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-input bg-background p-0.5">
      <button
        type="button"
        onClick={() => onChange('ticket')}
        className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${
          formato === 'ticket' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
        }`}
      >
        <ReceiptText className="h-3.5 w-3.5" /> Ticket 80mm
      </button>
      <button
        type="button"
        onClick={() => onChange('factura')}
        className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${
          formato === 'factura' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
        }`}
      >
        <Printer className="h-3.5 w-3.5" /> Factura A4
      </button>
    </div>
  );
}
