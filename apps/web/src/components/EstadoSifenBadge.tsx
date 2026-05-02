import { AlertCircle, Ban, CheckCircle2, Clock, CircleSlash, XCircle } from 'lucide-react';

import type { EstadoSifen } from '@/hooks/useComprobantes';

import { cn } from '@/lib/utils';

const STYLES: Record<EstadoSifen, { label: string; className: string; Icon: typeof Clock }> = {
  NO_ENVIADO: {
    label: 'No enviado',
    className: 'bg-muted text-muted-foreground border-muted-foreground/20',
    Icon: CircleSlash,
  },
  PENDIENTE: {
    label: 'Pendiente',
    className:
      'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200',
    Icon: Clock,
  },
  APROBADO: {
    label: 'Aprobado',
    className:
      'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200',
    Icon: CheckCircle2,
  },
  RECHAZADO: {
    label: 'Rechazado',
    className: 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950/50 dark:text-red-200',
    Icon: XCircle,
  },
  CANCELADO: {
    label: 'Cancelado',
    className: 'bg-slate-200 text-slate-700 border-slate-400 dark:bg-slate-800 dark:text-slate-300',
    Icon: Ban,
  },
  INUTILIZADO: {
    label: 'Inutilizado',
    className:
      'bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-950/50 dark:text-violet-200',
    Icon: AlertCircle,
  },
};

export function EstadoSifenBadge({
  estado,
  size = 'sm',
  withIcon = true,
}: {
  estado: EstadoSifen;
  size?: 'xs' | 'sm' | 'md';
  withIcon?: boolean;
}) {
  const { label, className, Icon } = STYLES[estado];
  const sizeClass =
    size === 'xs'
      ? 'text-[10px] px-1.5 py-0.5 gap-1'
      : size === 'md'
        ? 'text-sm px-2.5 py-1 gap-1.5'
        : 'text-xs px-2 py-0.5 gap-1';
  const iconSize = size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-semibold uppercase tracking-wide',
        sizeClass,
        className,
      )}
    >
      {withIcon && <Icon className={iconSize} />}
      {label}
    </span>
  );
}
