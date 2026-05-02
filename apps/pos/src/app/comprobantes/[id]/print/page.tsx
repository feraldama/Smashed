'use client';

import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useRef } from 'react';

import { AuthGate } from '@/components/AuthGate';
import { TicketTermico } from '@/components/TicketTermico';
import { useComprobante } from '@/hooks/useComprobante';

/**
 * Página dedicada a imprimir un comprobante.
 *
 * Comportamiento:
 *  - Auto-print al cargar (después de un pequeño delay para que las imágenes/fonts terminen)
 *  - Botón "Imprimir" para reintentar manual
 *  - Vista del ticket bien centrada y dimensionada para 80mm
 *  - CSS @page configurado en globals.css para impresoras térmicas
 */
export default function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <PrintScreen id={id} />
    </AuthGate>
  );
}

function PrintScreen({ id }: { id: string }) {
  const { data: comprobante, isLoading, isError } = useComprobante(id);
  const autoPrintedRef = useRef(false);

  // Auto-print una sola vez cuando los datos están listos
  useEffect(() => {
    if (!comprobante || autoPrintedRef.current) return;
    autoPrintedRef.current = true;
    // Delay para asegurar que el DOM y los estilos están listos
    const t = setTimeout(() => {
      window.print();
    }, 350);
    return () => clearTimeout(t);
  }, [comprobante]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !comprobante) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-destructive">Error cargando el comprobante</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Toolbar — oculta en impresión */}
      <div className="sticky top-0 z-10 border-b bg-card print:hidden">
        <div className="container flex items-center justify-between gap-2 py-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" /> Volver al POS
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      </div>

      {/* Ticket centrado */}
      <div className="flex justify-center py-6 print:py-0">
        <div className="bg-white shadow-lg print:shadow-none">
          <TicketTermico comprobante={comprobante} />
        </div>
      </div>
    </div>
  );
}
