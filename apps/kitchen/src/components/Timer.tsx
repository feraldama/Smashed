'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Timer en vivo que muestra cuánto tiempo pasó desde `since`.
 * Color cambia según urgencia: verde <5min, amber 5-10, rojo >10.
 */
export function Timer({ since }: { since: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!since) return <span className="font-mono text-sm text-muted-foreground">--:--</span>;

  const elapsed = Math.floor((now - new Date(since).getTime()) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-sm font-bold',
        mins < 5 && 'bg-emerald-500/15 text-emerald-400',
        mins >= 5 && mins < 10 && 'bg-amber-500/15 text-amber-400',
        mins >= 10 && 'animate-pulse bg-red-500/20 text-red-400',
      )}
    >
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  );
}
