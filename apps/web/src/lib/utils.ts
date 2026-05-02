import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PYG_FORMATTER = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

export function formatGs(value: number | bigint | string, withSymbol = true): string {
  const n =
    typeof value === 'string' ? Number(value) : typeof value === 'bigint' ? Number(value) : value;
  const formatted = PYG_FORMATTER.format(Math.trunc(n));
  return withSymbol ? `₲ ${formatted}` : formatted;
}
