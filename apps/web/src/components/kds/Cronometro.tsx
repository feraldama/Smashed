'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface Props {
  /** ISO timestamp de cuándo se confirmó el pedido. */
  desde: string;
  /** Tiempo de preparación esperado en segundos. Si lo supera → rojo. */
  tiempoEsperadoSegundos?: number | null;
}

/**
 * Cronómetro en vivo desde `desde`. Color-coded:
 *  - Verde: dentro del tiempo esperado (o sin tiempo configurado y < 5min)
 *  - Ámbar: 80%-100% del tiempo esperado, o 5-10min si sin config
 *  - Rojo: superado el tiempo esperado, o > 10min sin config
 */
export function Cronometro({ desde, tiempoEsperadoSegundos }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const transcurridoMs = now - new Date(desde).getTime();
  const transcurridoSeg = Math.max(0, Math.floor(transcurridoMs / 1000));
  const min = Math.floor(transcurridoSeg / 60);
  const sec = transcurridoSeg % 60;

  let color: 'green' | 'amber' | 'red';
  if (tiempoEsperadoSegundos && tiempoEsperadoSegundos > 0) {
    const pct = transcurridoSeg / tiempoEsperadoSegundos;
    if (pct < 0.8) color = 'green';
    else if (pct < 1) color = 'amber';
    else color = 'red';
  } else {
    if (transcurridoSeg < 300) color = 'green';
    else if (transcurridoSeg < 600) color = 'amber';
    else color = 'red';
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-mono font-bold tabular-nums',
        color === 'green' &&
          'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200',
        color === 'amber' && 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
        color === 'red' && 'bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200',
      )}
    >
      {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
    </span>
  );
}
