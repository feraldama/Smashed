/**
 * Helpers para guaraní paraguayo. Sin decimales, formato `₲ 1.234.567`.
 * Internamente almacenamos como número entero (BigInt en BD, number en TS hasta 2^53).
 */

const FORMATTER = new Intl.NumberFormat('es-PY', {
  style: 'decimal',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatGs(amount: number | bigint, withSymbol = true): string {
  const n = typeof amount === 'bigint' ? Number(amount) : amount;
  const formatted = FORMATTER.format(Math.trunc(n));
  return withSymbol ? `₲ ${formatted}` : formatted;
}

/**
 * Parsea un string en formato local (con o sin símbolo, con puntos como separador de miles)
 * y retorna entero. Retorna NaN si no es válido.
 */
export function parseGs(input: string): number {
  const clean = input.replace(/[₲\s]/g, '').replace(/\./g, '').trim();
  if (clean === '' || !/^-?\d+$/.test(clean)) return Number.NaN;
  return Number.parseInt(clean, 10);
}

/**
 * Calcula IVA discriminado de un precio que YA incluye IVA (caso normal en Paraguay).
 *
 *   precio_iva_incluido / (1 + tasa) = base
 *   precio_iva_incluido - base = iva
 *
 * Para tasa 10%: IVA = precio / 11
 * Para tasa 5%:  IVA = precio / 21
 * Para exento/0%: IVA = 0
 *
 * Retornamos enteros (redondeo bancario hacia el más cercano).
 */
export function discriminarIva(
  precioConIva: number,
  tasa: 0 | 5 | 10,
): { base: number; iva: number; total: number } {
  if (tasa === 0) {
    return { base: precioConIva, iva: 0, total: precioConIva };
  }
  const factor = tasa === 10 ? 11 : 21;
  const iva = Math.round(precioConIva / factor);
  const base = precioConIva - iva;
  return { base, iva, total: precioConIva };
}
