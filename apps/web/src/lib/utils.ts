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

/**
 * Genera un identificador local para usar como `key` en listas. No es seguro
 * criptográficamente — sólo lo usamos para diferenciar filas en formularios.
 *
 * Usa `crypto.randomUUID()` si está disponible (browsers en HTTPS o localhost),
 * y cae a `Math.random()` cuando se accede vía LAN/HTTP donde el navegador
 * no expone Web Crypto por no ser un secure context.
 */
export function localId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
