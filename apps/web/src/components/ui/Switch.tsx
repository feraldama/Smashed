'use client';

import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  id?: string;
  'aria-label'?: string;
}

/**
 * Toggle accesible al estilo shadcn/ui.
 * - Track: h-6 w-11 (md) / h-5 w-9 (sm).
 * - Thumb: círculo con shadow que se desliza con transform.
 * - Focus visible con ring del primary.
 * - role="switch" + aria-checked.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  size = 'md',
  id,
  'aria-label': ariaLabel,
}: SwitchProps) {
  const dims =
    size === 'md'
      ? {
          track: 'h-6 w-11',
          thumb: 'h-5 w-5',
          translate: checked ? 'translate-x-5' : 'translate-x-0.5',
        }
      : {
          track: 'h-5 w-9',
          thumb: 'h-4 w-4',
          translate: checked ? 'translate-x-4' : 'translate-x-0.5',
        };

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        dims.track,
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block rounded-full bg-white shadow-sm ring-0 transition-transform',
          dims.thumb,
          dims.translate,
        )}
      />
    </button>
  );
}

/** Wrapper con label clickeable: la fila entera funciona como hit target. */
export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex-1">
        <button
          type="button"
          onClick={() => !disabled && onCheckedChange(!checked)}
          disabled={disabled}
          className="block w-full text-left disabled:cursor-not-allowed disabled:opacity-50"
        >
          <p className="text-sm font-medium leading-tight">{label}</p>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </button>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}
