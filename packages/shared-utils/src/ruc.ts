/**
 * Validación de RUC paraguayo según algoritmo módulo 11 oficial de la SET.
 *
 * Formato canónico almacenado: `ruc` (número sin DV) + `dv` (1 dígito).
 * Esta función calcula el DV esperado dado el número RUC base.
 *
 * Algoritmo (SET Paraguay):
 *  - Tomar el RUC como string numérico, recorrer de derecha a izquierda
 *  - Multiplicar cada dígito por un factor cíclico [2..11]
 *  - Sumar los productos
 *  - resto = suma % 11
 *  - Si resto < 2 → dv = 0, si no → dv = 11 - resto
 */

export function calcularDvRuc(ruc: string): number {
  const clean = ruc.replace(/\D/g, '');
  if (!clean || clean.length === 0) {
    throw new Error('RUC vacío o sin dígitos');
  }

  // Convertimos cada char a su código ASCII según la SET (sólo dígitos 0-9 están en uso real,
  // pero el algoritmo oficial usa charCodeAt para soportar cualquier carácter alfanumérico).
  let total = 0;
  let factor = 2;
  const FACTOR_MAX = 11;

  for (let i = clean.length - 1; i >= 0; i -= 1) {
    const code = clean.charCodeAt(i) - 48; // '0' = 48
    total += code * factor;
    factor = factor === FACTOR_MAX ? 2 : factor + 1;
  }

  const resto = total % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarRuc(ruc: string, dv: string | number): boolean {
  const dvNum = typeof dv === 'string' ? Number.parseInt(dv, 10) : dv;
  if (Number.isNaN(dvNum) || dvNum < 0 || dvNum > 9) return false;
  try {
    return calcularDvRuc(ruc) === dvNum;
  } catch {
    return false;
  }
}

/**
 * Acepta formato "1234567-8" o "1234567" + dv aparte y retorna { ruc, dv } o null si inválido.
 */
export function parseRucCompleto(input: string): { ruc: string; dv: string } | null {
  const clean = input.trim();
  const match = /^(\d{1,8})-(\d)$/.exec(clean);
  if (!match) return null;
  const [, ruc, dv] = match;
  if (!ruc || !dv) return null;
  return validarRuc(ruc, dv) ? { ruc, dv } : null;
}
