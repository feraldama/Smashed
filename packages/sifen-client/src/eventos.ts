/**
 * Generación de XMLs de eventos SIFEN.
 *
 * Eventos soportados:
 *  - Cancelación:    dentro de las 48h hábiles desde la emisión.
 *  - Inutilización:  para anular un rango de numeración no usada.
 *  - Conformidad:    receptor confirma recepción del DE.
 *  - Disconformidad: receptor rechaza el DE.
 *
 * Por ahora implementamos sólo cancelación.
 * Cada evento se firma con XAdES-BES igual que el DE (ver firma.ts).
 */

import { calcularDvModulo11 } from './cdc.js';

const NS = 'http://ekuatia.set.gov.py/sifen/xsd';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface CancelacionInput {
  cdc: string;
  motivo: string; // 5-500 chars según DNIT
  /** ID del evento — debe ser único por contribuyente. */
  idEvento: number;
  /** Fecha de emisión del evento (default: ahora). */
  fechaFirma?: Date;
}

/**
 * Construye el XML de evento de cancelación.
 * El XML resultante todavía debe firmarse antes de enviar.
 *
 * Estructura simplificada según diseño DNIT (Manual de Eventos v150):
 *
 *   <rEv xmlns="...">
 *     <dEvReg>
 *       <gGroupGesEve>
 *         <rGesEve>
 *           <rEve Id="<idEvento>">
 *             <dFecFirma>2026-05-15T...</dFecFirma>
 *             <dVerFor>150</dVerFor>
 *             <gGroupTiEvt>
 *               <rGeVeCan>
 *                 <Id>CDC del DE original</Id>
 *                 <mOtEve>motivo</mOtEve>
 *               </rGeVeCan>
 *             </gGroupTiEvt>
 *           </rEve>
 *         </rGesEve>
 *       </gGroupGesEve>
 *     </dEvReg>
 *   </rEv>
 */
export function buildEventoCancelacionXml(input: CancelacionInput): string {
  if (input.cdc.length !== 44) throw new Error('CDC debe ser 44 dígitos');
  if (input.motivo.length < 5 || input.motivo.length > 500) {
    throw new Error('Motivo debe tener entre 5 y 500 caracteres');
  }

  const fecha = (input.fechaFirma ?? new Date()).toISOString().slice(0, 19); // YYYY-MM-DDTHH:mm:ss
  const idEventoStr = String(input.idEvento).padStart(15, '0');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rEv xmlns="${NS}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <dEvReg>
    <gGroupGesEve>
      <rGesEve>
        <rEve Id="${idEventoStr}">
          <dFecFirma>${fecha}</dFecFirma>
          <dVerFor>150</dVerFor>
          <gGroupTiEvt>
            <rGeVeCan>
              <Id>${input.cdc}</Id>
              <mOtEve>${escapeXml(input.motivo)}</mOtEve>
            </rGeVeCan>
          </gGroupTiEvt>
        </rEve>
      </rGesEve>
    </gGroupGesEve>
  </dEvReg>
</rEv>`;
}

/**
 * Genera un ID de evento único determinístico a partir del CDC + tipo de evento.
 * Usa los primeros 14 dígitos del CDC + 1 dígito tipo (1=Cancelación, 2=Inut...)
 * + DV módulo 11 sobre los 15 dígitos.
 */
export function generarIdEvento(cdc: string, tipoEvento: 1 | 2 | 3 | 4 = 1): number {
  if (cdc.length !== 44) throw new Error('CDC inválido');
  const base = cdc.slice(0, 14) + tipoEvento.toString();
  const dv = calcularDvModulo11(base);
  return Number(base + dv.toString());
}
