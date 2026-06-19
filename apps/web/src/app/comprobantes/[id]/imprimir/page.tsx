'use client';

import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AuthGate, ROLES_OPERATIVOS } from '@/components/AuthGate';
import { TicketTermico } from '@/components/imprimir/TicketTermico';
import { useComprobante } from '@/hooks/useComprobantes';

export default function ImprimirComprobantePage() {
  // La impresión la usa cualquier rol operativo (CAJERO/MESERO emiten desde POS,
  // GERENTE/ADMIN reimprimen desde el detalle). No se gatea por menú porque
  // /comprobantes como listado está restringido a admins.
  return (
    <AuthGate roles={ROLES_OPERATIVOS}>
      <ImprimirScreen />
    </AuthGate>
  );
}

function ImprimirScreen() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();

  const { data: comp, isLoading, isError } = useComprobante(id);

  // Todo comprobante (ticket, factura y notas) se imprime en 75mm térmico.
  // El TicketTermico ya distingue el tipo de documento en la cabecera.
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
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      </div>

      {/* Contenido imprimible */}
      <main className="print-area py-6 print:py-0">
        <TicketTermico comp={comp} />
      </main>

      {/* CSS de impresión: siempre 75mm × auto */}
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
            size: 69mm auto;
            margin: 0;
          }
          .ticket-print {
            width: 66mm;
            padding: 1.5mm;
            margin: 0;
          }
        }
      `}</style>
    </div>
  );
}
