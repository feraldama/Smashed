import { createHash } from 'node:crypto';

import type { AmbienteSifen, DocumentoElectronicoInput } from './types.js';

/**
 * Genera la URL del QR para imprimir en el ticket.
 * Cuando el cliente escanea, lo lleva a la consulta pública del documento en eKuatia.
 *
 * El QR contiene un hash que valida la integridad del DE más datos clave.
 * Estructura según Manual Técnico DNIT (Anexo 6 — Generación del QR):
 *
 *   <baseUrl>/consultas/qr?
 *     nVersion=150
 *     &Id=<CDC>
 *     &dFeEmiDE=<fecha emisión hex>
 *     &dRucRec=<RUC receptor>     (o dNumIDRec si no es RUC)
 *     &dTotGralOpe=<total>
 *     &dTotIVA=<iva total>
 *     &cItems=<cantidad items>
 *     &DigestValue=<digest del XML firmado>
 *     &IdCSC=<id del CSC>
 *     &cHashQR=<sha256 hex de la URL anterior + CSC>
 *
 * Ambiente:
 *  - test:  https://ekuatia.set.gov.py
 *  - prod:  https://ekuatia.set.gov.py  (mismo)
 */

export interface QrInput {
  cdc: string;
  fechaEmision: Date;
  receptor: {
    ruc?: string;
    dv?: string;
    documento?: string;
  };
  totalGeneral: bigint;
  totalIva: bigint;
  cantidadItems: number;
  digestValue: string; // del XML firmado
  /** ID y valor del Código de Seguridad del Contribuyente (CSC) — emitido por DNIT. */
  idCSC: string; // ej "0001"
  csc: string; // valor del CSC (no se incluye en la URL, sólo se usa para el hash)
  ambiente?: AmbienteSifen;
}

const VERSION = '150';

export function generarQrUrl(input: QrInput): string {
  const baseUrl = 'https://ekuatia.set.gov.py';

  const fechaHex = Buffer.from(formatFechaEmision(input.fechaEmision), 'utf8').toString('hex');

  const params: Array<[string, string]> = [
    ['nVersion', VERSION],
    ['Id', input.cdc],
    ['dFeEmiDE', fechaHex],
  ];

  if (input.receptor.ruc) {
    params.push(['dRucRec', input.receptor.ruc]);
    if (input.receptor.dv) params.push(['dDVRec', input.receptor.dv]);
  } else if (input.receptor.documento) {
    params.push(['dNumIDRec', input.receptor.documento]);
  }

  params.push(
    ['dTotGralOpe', input.totalGeneral.toString()],
    ['dTotIVA', input.totalIva.toString()],
    ['cItems', String(input.cantidadItems)],
    ['DigestValue', input.digestValue],
    ['IdCSC', input.idCSC],
  );

  // Construir la query string sin el cHashQR todavía
  const queryBase = params.map(([k, v]) => `${k}=${v}`).join('&');

  // Calcular cHashQR = sha256( queryBase + csc )
  const hash = createHash('sha256')
    .update(queryBase + input.csc)
    .digest('hex');

  return `${baseUrl}/consultas/qr?${queryBase}&cHashQR=${hash}`;
}

/**
 * Re-genera la QR URL desde un CDC + datos del DE.
 * Útil cuando ya tenés el CDC calculado y querés generar el QR junto.
 */
export function generarQrDesdeDocumento(
  cdc: string,
  doc: DocumentoElectronicoInput,
  digestValue: string,
  csc: { id: string; valor: string },
): string {
  const totalGeneral = doc.items.reduce(
    (acc, it) => acc + it.precioUnitario * BigInt(it.cantidad) - (it.descuento ?? 0n),
    0n,
  );
  const totalIva = doc.items.reduce((acc, it) => {
    if (it.tasaIva === 10) {
      const subtotal = it.precioUnitario * BigInt(it.cantidad) - (it.descuento ?? 0n);
      return acc + roundDiv(subtotal, 11n);
    }
    if (it.tasaIva === 5) {
      const subtotal = it.precioUnitario * BigInt(it.cantidad) - (it.descuento ?? 0n);
      return acc + roundDiv(subtotal, 21n);
    }
    return acc;
  }, 0n);

  return generarQrUrl({
    cdc,
    fechaEmision: doc.fechaEmision,
    receptor: { ruc: doc.receptor.ruc, dv: doc.receptor.dv, documento: doc.receptor.documento },
    totalGeneral,
    totalIva,
    cantidadItems: doc.items.length,
    digestValue,
    idCSC: csc.id,
    csc: csc.valor,
  });
}

function formatFechaEmision(d: Date): string {
  // ISO 8601 en TZ Asunción — manual técnico pide "YYYY-MM-DDTHH:mm:ss"
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Asuncion',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  // year-month-day T hh:mm:ss
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

function roundDiv(num: bigint, denom: bigint): bigint {
  const q = num / denom;
  const r = num % denom;
  if (r * 2n >= denom) return q + 1n;
  return q;
}
