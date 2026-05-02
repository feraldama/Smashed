/**
 * Cálculo del Código de Control (CDC) según DNIT Paraguay.
 *
 * El CDC es un identificador único de 44 dígitos que compone:
 *  - 2 dígitos: tipo de documento (01..07)
 *  - 8 dígitos: RUC emisor (sin DV)
 *  - 1 dígito:  DV del RUC emisor
 *  - 3 dígitos: establecimiento (e.g. "001")
 *  - 3 dígitos: punto de expedición (e.g. "001")
 *  - 7 dígitos: número del documento (e.g. "0000001")
 *  - 1 dígito:  tipo contribuyente emisor (1=PF, 2=PJ)
 *  - 8 dígitos: fecha emisión YYYYMMDD
 *  - 1 dígito:  tipo de emisión (1=Normal, 2=Contingencia)
 *  - 9 dígitos: código de seguridad (random)
 *  - 1 dígito:  DV (módulo 11 con factores 2..11 sobre los 43 anteriores)
 *
 * Total: 44 dígitos.
 */

import type { TipoContribuyente, TipoDocumentoSifen, TipoEmisionSifen } from './types.js';

export interface CdcInput {
  tipoDocumento: TipoDocumentoSifen;
  rucEmisor: string; // sin DV (max 8)
  dvEmisor: string; // 1 dígito
  establecimiento: string; // 3 chars
  puntoExpedicion: string; // 3 chars
  numeroDocumento: number; // hasta 7 dígitos
  tipoContribuyente: TipoContribuyente;
  fechaEmision: Date;
  tipoEmision: TipoEmisionSifen;
  codigoSeguridad: string; // 9 dígitos
}

/**
 * Calcula el CDC completo (44 dígitos).
 * Lanza Error si los inputs son inválidos.
 */
export function calcularCdc(input: CdcInput): string {
  const tipoDoc = String(input.tipoDocumento).padStart(2, '0');
  const ruc = input.rucEmisor.padStart(8, '0');
  if (ruc.length !== 8 || !/^\d+$/.test(ruc)) {
    throw new Error('RUC emisor inválido (debe ser 1-8 dígitos)');
  }
  const dv = input.dvEmisor;
  if (!/^\d$/.test(dv)) throw new Error('DV emisor inválido (1 dígito)');

  const est = input.establecimiento.padStart(3, '0');
  const pto = input.puntoExpedicion.padStart(3, '0');
  if (est.length !== 3 || !/^\d{3}$/.test(est)) throw new Error('Establecimiento inválido');
  if (pto.length !== 3 || !/^\d{3}$/.test(pto)) throw new Error('Punto expedición inválido');

  const num = String(input.numeroDocumento).padStart(7, '0');
  if (num.length !== 7) throw new Error('Número de documento excede 7 dígitos');

  const tipoCont = String(input.tipoContribuyente);
  const fecha = formatYYYYMMDD(input.fechaEmision);
  const tipoEm = String(input.tipoEmision);

  if (!/^\d{9}$/.test(input.codigoSeguridad)) {
    throw new Error('Código de seguridad debe ser exactamente 9 dígitos');
  }
  const codSeg = input.codigoSeguridad;

  const base43 = `${tipoDoc}${ruc}${dv}${est}${pto}${num}${tipoCont}${fecha}${tipoEm}${codSeg}`;
  if (base43.length !== 43) {
    throw new Error(`Base CDC debe ser 43 dígitos, fue ${base43.length}`);
  }

  const dvCdc = calcularDvModulo11(base43);
  return `${base43}${dvCdc}`;
}

/**
 * Genera un código de seguridad de 9 dígitos pseudoaleatorio.
 * No usar en escenarios donde la entropía importe — esto es solo para que el CDC
 * sea único entre comprobantes con mismo establecimiento+pto+número.
 */
export function generarCodigoSeguridad(): string {
  let s = '';
  for (let i = 0; i < 9; i += 1) {
    s += Math.floor(Math.random() * 10).toString();
  }
  return s;
}

/**
 * DV módulo 11 — algoritmo SET Paraguay (mismo que DV de RUC, pero aplicado al CDC).
 *
 * Recorre los dígitos de derecha a izquierda multiplicando por factores
 * cíclicos 2..11. Suma total. Resto = suma % 11.
 *  - Si resto < 2 → DV = 0
 *  - Si no       → DV = 11 - resto
 */
export function calcularDvModulo11(s: string): number {
  if (!/^\d+$/.test(s)) throw new Error('Cadena para DV debe ser solo dígitos');

  let total = 0;
  let factor = 2;
  const FACTOR_MAX = 11;

  for (let i = s.length - 1; i >= 0; i -= 1) {
    const d = s.charCodeAt(i) - 48; // '0' = 48
    total += d * factor;
    factor = factor === FACTOR_MAX ? 2 : factor + 1;
  }

  const resto = total % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/**
 * Convierte un Date a "YYYYMMDD" en zona horaria America/Asuncion.
 * Usado en el CDC.
 */
export function formatYYYYMMDD(d: Date): string {
  // Usamos toLocaleDateString con la zona explícita para evitar drift por UTC
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Asuncion',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA da YYYY-MM-DD; quitamos los guiones
  return fmt.format(d).replace(/-/g, '');
}

/**
 * Parsea un CDC y devuelve sus componentes.
 * Útil para verificación y display.
 */
export function parsearCdc(cdc: string): {
  tipoDocumento: number;
  rucEmisor: string;
  dvEmisor: string;
  establecimiento: string;
  puntoExpedicion: string;
  numeroDocumento: string;
  tipoContribuyente: number;
  fechaEmision: string;
  tipoEmision: number;
  codigoSeguridad: string;
  dv: string;
} {
  if (cdc.length !== 44 || !/^\d{44}$/.test(cdc)) {
    throw new Error('CDC debe ser 44 dígitos');
  }
  return {
    tipoDocumento: Number(cdc.slice(0, 2)),
    rucEmisor: cdc.slice(2, 10),
    dvEmisor: cdc.slice(10, 11),
    establecimiento: cdc.slice(11, 14),
    puntoExpedicion: cdc.slice(14, 17),
    numeroDocumento: cdc.slice(17, 24),
    tipoContribuyente: Number(cdc.slice(24, 25)),
    fechaEmision: cdc.slice(25, 33),
    tipoEmision: Number(cdc.slice(33, 34)),
    codigoSeguridad: cdc.slice(34, 43),
    dv: cdc.slice(43, 44),
  };
}

/** Verifica que el DV (último dígito) del CDC sea correcto. */
export function verificarCdc(cdc: string): boolean {
  if (cdc.length !== 44 || !/^\d{44}$/.test(cdc)) return false;
  const base = cdc.slice(0, 43);
  const dv = Number(cdc.slice(43, 44));
  return calcularDvModulo11(base) === dv;
}
