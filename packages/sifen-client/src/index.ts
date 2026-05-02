/**
 * @smash/sifen-client — Cliente SIFEN/DNIT Paraguay.
 *
 * Estado actual (Fase 4.1):
 *  - ✅ Cálculo de CDC (Código de Control 44 dígitos)
 *  - ✅ XML builder según Manual Técnico DNIT v150 (campos obligatorios)
 *  - ✅ Generador URL del QR para impresión en tickets
 *  - ✅ Tipos completos del Documento Electrónico
 *
 * Próximos checkpoints:
 *  - 4.2: Firma digital XAdES-BES con certificado X.509 (.p12)
 *  - 4.3: Cliente SOAP para envío a SIFEN + worker BullMQ + endpoints API
 *  - 4.4: UI admin para gestión de comprobantes electrónicos
 */

export * from './cdc.js';
export * from './cert.js';
export * from './client.js';
export * from './eventos.js';
export * from './firma.js';
export * from './qr.js';
export * from './types.js';
export * from './xml-builder.js';

import { calcularCdc, generarCodigoSeguridad } from './cdc.js';
import { generarQrDesdeDocumento } from './qr.js';
import { buildDocumentoElectronicoXml } from './xml-builder.js';

import type { DocumentoElectronicoInput, DocumentoElectronicoResult } from './types.js';

/**
 * Genera el documento electrónico completo: CDC + XML (sin firmar) + QR URL.
 *
 * El XML resultante todavía debe firmarse antes de enviar a SIFEN.
 * El digestValue real se obtiene de la firma; acá usamos un placeholder.
 * Para Fase 4.2 esta función debería integrarse con el firmador.
 */
export function generarDocumentoElectronico(
  doc: DocumentoElectronicoInput,
  csc: { id: string; valor: string },
): DocumentoElectronicoResult {
  const codigoSeguridad = doc.codigoSeguridad || generarCodigoSeguridad();

  const cdc = calcularCdc({
    tipoDocumento: doc.tipoDocumento,
    rucEmisor: doc.emisor.ruc,
    dvEmisor: doc.emisor.dv,
    establecimiento: doc.emisor.establecimiento,
    puntoExpedicion: doc.emisor.puntoExpedicion,
    numeroDocumento: doc.numeroDocumento,
    tipoContribuyente: doc.emisor.tipoContribuyente,
    fechaEmision: doc.fechaEmision,
    tipoEmision: doc.tipoEmision,
    codigoSeguridad,
  });

  const xml = buildDocumentoElectronicoXml({
    cdc,
    doc: { ...doc, codigoSeguridad },
  });

  // Para la URL del QR pre-firma, usamos un digestValue placeholder.
  // Después de firmar, el QR debería regenerarse con el digestValue real.
  const qrUrl = generarQrDesdeDocumento(cdc, doc, 'PRE_FIRMA', csc);

  return { cdc, xml, qrUrl };
}
