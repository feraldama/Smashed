import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * cn — combina clases Tailwind con resolución de conflictos.
 * El estándar shadcn/ui.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatea un guaraní entero como `₲ 1.234.567`.
 * Hay un helper más completo en @smash/shared-utils, este es la copia
 * client-side para no transferir todo el package al bundle del browser.
 */
const PYG_FORMATTER = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

export function formatGs(value: number | bigint | string, withSymbol = true): string {
  const n =
    typeof value === 'string' ? Number(value) : typeof value === 'bigint' ? Number(value) : value;
  const formatted = PYG_FORMATTER.format(Math.trunc(n));
  return withSymbol ? `₲ ${formatted}` : formatted;
}
