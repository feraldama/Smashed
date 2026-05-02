/**
 * XML builder para Documento Electrónico (DE) SIFEN.
 *
 * Implementa el formato según Manual Técnico DNIT v150 (campos obligatorios).
 * NO firma el XML — sólo lo construye. La firma XAdES-BES se aplica
 * después con un certificado X.509 (ver firma.ts en checkpoint 4.2).
 *
 * Devuelve el XML como string serializado con declaración + namespace SIFEN.
 *
 * NOTA: Este builder simplificado cubre los campos obligatorios para FACTURA y
 * NOTA DE CREDITO/DEBITO en operaciones B2B/B2C internas Paraguay. Casos avanzados
 * (autoFactura, importaciones, autorización judicial, transporte, etc.) se agregan
 * por extensión sobre la misma estructura.
 */

import type { DocumentoElectronicoInput, ItemDE, TasaIvaSifen } from './types.js';

const NS = 'http://ekuatia.set.gov.py/sifen/xsd';
const VERSION = '150';

// ───── Helpers de escape XML ─────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tag(name: string, value: string | number | bigint | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  const v = typeof value === 'string' ? escapeXml(value) : String(value);
  return `<${name}>${v}</${name}>`;
}

function tagOpt(name: string, value: string | number | bigint | undefined | null): string {
  return tag(name, value);
}

function fmtIso(d: Date): string {
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
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

function discriminarIva(monto: bigint, tasa: TasaIvaSifen): { base: bigint; iva: bigint } {
  if (tasa === 0) return { base: monto, iva: 0n };
  const factor = tasa === 10 ? 11n : 21n;
  const iva = roundDiv(monto, factor);
  const base = monto - iva;
  return { base, iva };
}

function roundDiv(num: bigint, denom: bigint): bigint {
  const q = num / denom;
  const r = num % denom;
  if (r * 2n >= denom) return q + 1n;
  return q;
}

// ───── Builder principal ─────

export interface BuildXmlOptions {
  cdc: string;
  doc: DocumentoElectronicoInput;
  /** ID interno opcional para el atributo Id="..." del rDE. */
  idRde?: string;
}

export function buildDocumentoElectronicoXml(opts: BuildXmlOptions): string {
  const { cdc, doc } = opts;
  const idRde = opts.idRde ?? `DE${cdc}`;

  const totalGeneralOp = doc.items.reduce(
    (acc, it) => acc + it.precioUnitario * BigInt(it.cantidad) - (it.descuento ?? 0n),
    0n,
  );

  const subtotalIva10 = doc.items
    .filter((it) => it.tasaIva === 10)
    .reduce((acc, it) => acc + subtotalItem(it), 0n);
  const subtotalIva5 = doc.items
    .filter((it) => it.tasaIva === 5)
    .reduce((acc, it) => acc + subtotalItem(it), 0n);
  const subtotalExentas = doc.items
    .filter((it) => it.tasaIva === 0)
    .reduce((acc, it) => acc + subtotalItem(it), 0n);

  const totalIva10 = roundDiv(subtotalIva10, 11n);
  const totalIva5 = roundDiv(subtotalIva5, 21n);
  const totalIva = totalIva10 + totalIva5;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rDE xmlns="${NS}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <dVerFor>${VERSION}</dVerFor>
  <DE Id="${escapeXml(idRde)}">
    ${gOpeDE(cdc, doc)}
    ${gTimb(doc)}
    ${gDatGralOpe(doc)}
    ${gDtipDE(doc)}
    ${gTotSub(doc, {
      totalGeneralOp,
      subtotalIva10,
      subtotalIva5,
      subtotalExentas,
      totalIva10,
      totalIva5,
      totalIva,
    })}
    ${doc.condicionPago?.length ? gCondPagos(doc.condicionPago) : ''}
    ${doc.observaciones ? `<gOpeDoc><iIndPres>${doc.indicadorPresencia}</iIndPres></gOpeDoc>` : ''}
    ${gItems(doc.items)}
  </DE>
</rDE>`;

  return xml.trim();
}

// ───── Sub-secciones ─────

function gOpeDE(cdc: string, doc: DocumentoElectronicoInput): string {
  return `<gOpeDE>
      <iTipEmi>${doc.tipoEmision}</iTipEmi>
      <dCodSeg>${doc.codigoSeguridad}</dCodSeg>
    </gOpeDE>
    ${tag('Id', cdc)}`;
}

function gTimb(doc: DocumentoElectronicoInput): string {
  const numero = String(doc.numeroDocumento).padStart(7, '0');
  return `<gTimb>
      <iTiDE>${doc.tipoDocumento}</iTiDE>
      <dEst>${doc.emisor.establecimiento}</dEst>
      <dPunExp>${doc.emisor.puntoExpedicion}</dPunExp>
      <dNumDoc>${numero}</dNumDoc>
      <dFeIniT>${formatYYYYMMDD(doc.fechaEmision)}</dFeIniT>
    </gTimb>`;
}

function gDatGralOpe(doc: DocumentoElectronicoInput): string {
  return `<gDatGralOpe>
      <dFeEmiDE>${fmtIso(doc.fechaEmision)}</dFeEmiDE>
      ${gOpeCom(doc)}
      ${gEmis(doc.emisor)}
      ${gDatRec(doc.receptor)}
    </gDatGralOpe>`;
}

function gOpeCom(doc: DocumentoElectronicoInput): string {
  const moneda = doc.moneda ?? 'PYG';
  return `<gOpeCom>
        <iTipTra>${doc.tipoTransaccion}</iTipTra>
        <iTImp>1</iTImp>
        <cMoneOpe>${moneda}</cMoneOpe>
        <dCondTiCam>1</dCondTiCam>
      </gOpeCom>`;
}

function gEmis(em: DocumentoElectronicoInput['emisor']): string {
  return `<gEmis>
        <dRucEm>${em.ruc}</dRucEm>
        <dDVEmi>${em.dv}</dDVEmi>
        <iTipCont>${em.tipoContribuyente}</iTipCont>
        <dNomEmi>${escapeXml(em.razonSocial)}</dNomEmi>
        ${tagOpt('dNomFanEmi', em.nombreFantasia)}
        <dDirEmi>${escapeXml(em.direccion)}</dDirEmi>
        ${tagOpt('dNumCas', em.numeroCasa)}
        ${em.ciudadCodigo ? `<cCiuEmi>${em.ciudadCodigo}</cCiuEmi>` : ''}
        <dDesCiuEmi>${escapeXml(em.ciudad)}</dDesCiuEmi>
        ${tagOpt('dTelEmi', em.telefono)}
        ${tagOpt('dEmailE', em.email)}
        ${
          em.actividadEconomica
            ? `<gActEco><cActEco>${em.actividadEconomica.codigo}</cActEco><dDesActEco>${escapeXml(em.actividadEconomica.descripcion)}</dDesActEco></gActEco>`
            : ''
        }
      </gEmis>`;
}

function gDatRec(rec: DocumentoElectronicoInput['receptor']): string {
  return `<gDatRec>
        <iNatRec>${rec.tipoOperacion === 1 ? 1 : 2}</iNatRec>
        <iTiOpe>${rec.tipoOperacion}</iTiOpe>
        <cPaisRec>${rec.pais ?? 'PRY'}</cPaisRec>
        ${rec.tipoContribuyente ? `<iTiContRec>${rec.tipoContribuyente}</iTiContRec>` : ''}
        ${rec.ruc ? `<dRucRec>${rec.ruc}</dRucRec><dDVRec>${rec.dv}</dDVRec>` : ''}
        ${
          rec.documento && !rec.ruc
            ? `<iTipIDRec>${rec.tipoDocumento ?? 1}</iTipIDRec><dNumIDRec>${rec.documento}</dNumIDRec>`
            : ''
        }
        <dNomRec>${escapeXml(rec.razonSocial)}</dNomRec>
        ${tagOpt('dNomFanRec', rec.nombreFantasia)}
        ${tagOpt('dDirRec', rec.direccion)}
        ${tagOpt('dEmailRec', rec.email)}
      </gDatRec>`;
}

function gDtipDE(doc: DocumentoElectronicoInput): string {
  // Específico del tipo de documento (factura, NC, ND...)
  if (doc.tipoDocumento === 1) {
    // Factura electrónica
    return `<gDtipDE>
      <gCamFE>
        <iIndPres>${doc.indicadorPresencia}</iIndPres>
      </gCamFE>
      <gCamCond>
        <iCondOpe>${doc.condicionVenta}</iCondOpe>
      </gCamCond>
    </gDtipDE>`;
  }
  if (doc.tipoDocumento === 5 || doc.tipoDocumento === 6) {
    // Nota de crédito o débito — requiere referencia
    const ref = doc.comprobanteAsociado;
    return `<gDtipDE>
      <gCamNCDE>
        <iMotEmi>${doc.motivoEmision ?? 1}</iMotEmi>
      </gCamNCDE>
      ${ref?.cdc ? `<gCamDEAsoc><iTipDocAso>${ref.formato ?? 1}</iTipDocAso><dCdCDERef>${ref.cdc}</dCdCDERef></gCamDEAsoc>` : ''}
    </gDtipDE>`;
  }
  return '<gDtipDE/>';
}

function gItems(items: ItemDE[]): string {
  return items.map(gCamItem).join('\n    ');
}

function gCamItem(it: ItemDE): string {
  const subtotal = subtotalItem(it);
  const { iva } = discriminarIva(subtotal, it.tasaIva);
  const proporcion = it.proporcionGravada ?? 100;

  return `<gCamItem>
      <dCodInt>${escapeXml(it.codigo)}</dCodInt>
      <dDesProSer>${escapeXml(it.descripcion)}</dDesProSer>
      <cUniMed>${it.unidadMedida}</cUniMed>
      <dCantProSer>${it.cantidad}</dCantProSer>
      <gValorItem>
        <dPUniProSer>${it.precioUnitario}</dPUniProSer>
        <dTotBruOpeItem>${it.precioUnitario * BigInt(it.cantidad)}</dTotBruOpeItem>
        ${it.descuento ? `<gValorRestaItem><dDescItem>${it.descuento}</dDescItem></gValorRestaItem>` : ''}
        <dTotOpeItem>${subtotal}</dTotOpeItem>
      </gValorItem>
      <gCamIVA>
        <iAfecIVA>${it.tasaIva === 0 ? 3 : 1}</iAfecIVA>
        <dPropIVA>${proporcion}</dPropIVA>
        <dTasaIVA>${it.tasaIva}</dTasaIVA>
        <dBasGravIVA>${subtotal - iva}</dBasGravIVA>
        <dLiqIVAItem>${iva}</dLiqIVAItem>
      </gCamIVA>
    </gCamItem>`;
}

interface TotalesPrecalculados {
  totalGeneralOp: bigint;
  subtotalIva10: bigint;
  subtotalIva5: bigint;
  subtotalExentas: bigint;
  totalIva10: bigint;
  totalIva5: bigint;
  totalIva: bigint;
}

function gTotSub(doc: DocumentoElectronicoInput, t: TotalesPrecalculados): string {
  return `<gTotSub>
      <dSubExe>${t.subtotalExentas}</dSubExe>
      <dSub5>${t.subtotalIva5}</dSub5>
      <dSub10>${t.subtotalIva10}</dSub10>
      <dTotOpe>${t.totalGeneralOp}</dTotOpe>
      <dTotDesc>0</dTotDesc>
      <dTotDescGlotem>0</dTotDescGlotem>
      <dTotAntItem>0</dTotAntItem>
      <dTotAnt>0</dTotAnt>
      <dPorcDescTotal>0</dPorcDescTotal>
      <dDescTotal>0</dDescTotal>
      <dAnticipo>0</dAnticipo>
      <dRedon>0</dRedon>
      <dTotGralOpe>${t.totalGeneralOp}</dTotGralOpe>
      <dIVA5>${t.totalIva5}</dIVA5>
      <dIVA10>${t.totalIva10}</dIVA10>
      <dTotIVA>${t.totalIva}</dTotIVA>
      <dTBasGraIva>${t.subtotalIva5 + t.subtotalIva10 - t.totalIva}</dTBasGraIva>
      <dTotalGs>${t.totalGeneralOp}</dTotalGs>
    </gTotSub>`;
  // Nota: campos como dDescGlobal, dAnticipo, dCambio, etc. quedan en 0 — se completan
  // cuando agreguemos descuentos globales o anticipos en futuras iteraciones.
}

function gCondPagos(pagos: NonNullable<DocumentoElectronicoInput['condicionPago']>): string {
  return `<gPagTarCD>
      ${pagos
        .map(
          (p) =>
            `<gPaConEFe><iTiPago>${p.metodo}</iTiPago><dMonTiPag>${p.monto}</dMonTiPag><cMoneTiPag>${p.moneda ?? 'PYG'}</cMoneTiPag></gPaConEFe>`,
        )
        .join('\n      ')}
    </gPagTarCD>`;
}

// ───── helpers exportados para tests ─────

export function subtotalItem(it: ItemDE): bigint {
  return it.precioUnitario * BigInt(it.cantidad) - (it.descuento ?? 0n);
}

function formatYYYYMMDD(d: Date): string {
  // Helper interno (la versión exportada vive en cdc.ts)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Asuncion',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d).replace(/-/g, '');
}
