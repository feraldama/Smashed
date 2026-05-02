'use client';

import { CircleDot, Wallet } from 'lucide-react';
import Link from 'next/link';

import { useAperturaActiva } from '@/hooks/useCaja';
import { cn, formatGs } from '@/lib/utils';

/**
 * Mini badge en el header del POS — muestra estado de la caja del usuario.
 * Click → /caja para abrir/cerrar.
 */
export function CajaIndicator() {
  const { data: apertura, isLoading } = useAperturaActiva();

  if (isLoading) {
    return (
      <div className="flex h-8 w-32 animate-pulse rounded-md bg-muted" aria-label="cargando caja" />
    );
  }

  if (!apertura) {
    return (
      <Link
        href="/caja"
        className={cn(
          'flex items-center gap-1.5 rounded-md border border-dashed border-amber-500/50 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900',
          'hover:bg-amber-100',
        )}
      >
        <Wallet className="h-3.5 w-3.5" />
        Sin caja abierta
      </Link>
    );
  }

  return (
    <Link
      href="/caja"
      className={cn(
        'flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900',
        'hover:bg-emerald-100',
      )}
    >
      <CircleDot className="h-3.5 w-3.5 text-emerald-600" />
      <span className="font-semibold">{apertura.caja.nombre}</span>
      <span className="text-emerald-700">· inicio {formatGs(apertura.montoInicial)}</span>
    </Link>
  );
}
