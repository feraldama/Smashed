import { createHash, createSign, createVerify } from 'node:crypto';

import forge from 'node-forge';

import type { CertCargado } from './cert.js';

/**
 * Firma XAdES-BES para Documentos Electrónicos SIFEN.
 *
 * Estructura del Signature insertado dentro de <rDE>:
 *
 *   <ds:Signature Id="signature1">
 *     <ds:SignedInfo>
 *       <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
 *       <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
 *       <ds:Reference URI="#<idDe>">
 *         <ds:Transforms>
 *           <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
 *           <ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
 *         </ds:Transforms>
 *         <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
 *         <ds:DigestValue>BASE64</ds:DigestValue>
 *       </ds:Reference>
 *     </ds:SignedInfo>
 *     <ds:SignatureValue>BASE64</ds:SignatureValue>
 *     <ds:KeyInfo>
 *       <ds:X509Data>
 *         <ds:X509Certificate>BASE64_CERT</ds:X509Certificate>
 *       </ds:X509Data>
 *     </ds:KeyInfo>
 *   </ds:Signature>
 *
 * NOTA sobre canonicalization (C14N):
 *  Esta implementación usa una variante simplificada (estable para los XML que
 *  produce nuestro builder). Para máxima interoperabilidad con SIFEN producción
 *  conviene reemplazar `c14nSimplificado()` por una librería completa
 *  (e.g. `xmldsigjs`). Lo dejamos identificado con un TODO.
 */

const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const C14N_ALGO = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const SIG_ALGO = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const ENV_TRANSFORM = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const DIGEST_ALGO = 'http://www.w3.org/2001/04/xmlenc#sha256';

export interface FirmarXmlInput {
  xml: string;
  cert: CertCargado;
  /** ID interno del Signature element. Por default "signature1". */
  signatureId?: string;
}

export interface FirmarXmlResult {
  /** XML completo con Signature inserto antes del cierre de </rDE>. */
  xmlFirmado: string;
  /** Digest SHA-256 base64 del nodo DE — se necesita para regenerar el QR. */
  digestValue: string;
  /** Firma RSA base64 del SignedInfo. */
  signatureValue: string;
}

/**
 * Firma un XML SIFEN con un certificado X.509.
 */
export function firmarXmlSifen(input: FirmarXmlInput): FirmarXmlResult {
  const { xml, cert, signatureId = 'signature1' } = input;

  // 1. Encontrar el Id del nodo DE
  const idMatch = /<DE\s+Id="([^"]+)">/.exec(xml);
  if (!idMatch) throw new Error('No se encontró atributo Id en el nodo <DE>');
  const idDe = idMatch[1]!;

  // 2. Extraer el nodo DE como string (entre <DE Id="..."> y </DE>)
  const deOpen = xml.indexOf(`<DE Id="${idDe}">`);
  const deClose = xml.indexOf('</DE>', deOpen);
  if (deOpen < 0 || deClose < 0) throw new Error('No se pudo extraer nodo <DE>');
  const deNodo = xml.slice(deOpen, deClose + '</DE>'.length);

  // 3. Calcular DigestValue del DE canonicalizado
  const deCanon = c14nSimplificado(deNodo);
  const digestValue = createHash('sha256').update(deCanon).digest('base64');

  // 4. Construir SignedInfo
  const signedInfo = buildSignedInfo({ idRef: idDe, digestValue });

  // 5. Firmar el SignedInfo canonicalizado con RSA-SHA256
  const signedInfoCanon = c14nSimplificado(signedInfo);

  // node-forge → privateKey en formato PEM, después usamos crypto built-in
  const privateKeyPem = forge.pki.privateKeyToPem(cert.privateKey);
  const signer = createSign('RSA-SHA256');
  signer.update(signedInfoCanon);
  signer.end();
  const signatureValue = signer.sign(privateKeyPem).toString('base64');

  // 6. Construir el elemento Signature completo
  const signatureElement = buildSignatureElement({
    signatureId,
    signedInfo,
    signatureValue,
    certBase64: cert.certBase64,
  });

  // 7. Insertar Signature antes del </rDE>
  const xmlFirmado = xml.replace(/<\/rDE>\s*$/, `${signatureElement}\n</rDE>`);

  return { xmlFirmado, digestValue, signatureValue };
}

/**
 * Verifica una firma XAdES-BES en un XML.
 * Útil para tests y validación interna.
 *
 * Retorna `{ valid: true }` si la firma es válida.
 * No verifica la cadena de confianza del cert (ese paso lo hace SIFEN).
 */
export function verificarFirma(xmlFirmado: string): { valid: boolean; error?: string } {
  try {
    const sigMatch = /<ds:Signature[^>]*>([\s\S]*?)<\/ds:Signature>/.exec(xmlFirmado);
    if (!sigMatch) return { valid: false, error: 'No se encontró <ds:Signature>' };

    const sigBlock = sigMatch[0];

    // Extraer SignedInfo
    const siMatch = /<ds:SignedInfo>[\s\S]*?<\/ds:SignedInfo>/.exec(sigBlock);
    if (!siMatch) return { valid: false, error: 'No se encontró <ds:SignedInfo>' };
    const signedInfoCanon = c14nSimplificado(siMatch[0]);

    // Extraer SignatureValue
    const svMatch = /<ds:SignatureValue>([\s\S]*?)<\/ds:SignatureValue>/.exec(sigBlock);
    if (!svMatch) return { valid: false, error: 'No se encontró SignatureValue' };
    const signatureValue = svMatch[1]!.trim();

    // Extraer cert
    const certMatch = /<ds:X509Certificate>([\s\S]*?)<\/ds:X509Certificate>/.exec(sigBlock);
    if (!certMatch) return { valid: false, error: 'No se encontró X509Certificate' };
    const certBase64 = certMatch[1]!.trim().replace(/\s+/g, '');

    // Reconstruir public key del cert
    const certDer = forge.util.decode64(certBase64);
    const certAsn1 = forge.asn1.fromDer(certDer);
    const cert = forge.pki.certificateFromAsn1(certAsn1);
    const publicKeyPem = forge.pki.publicKeyToPem(cert.publicKey);

    // Verificar firma
    const verifier = createVerify('RSA-SHA256');
    verifier.update(signedInfoCanon);
    verifier.end();
    const valid = verifier.verify(publicKeyPem, Buffer.from(signatureValue, 'base64'));

    return { valid };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ───── helpers internos ─────

function buildSignedInfo(args: { idRef: string; digestValue: string }): string {
  return `<ds:SignedInfo>
    <ds:CanonicalizationMethod Algorithm="${C14N_ALGO}"/>
    <ds:SignatureMethod Algorithm="${SIG_ALGO}"/>
    <ds:Reference URI="#${args.idRef}">
      <ds:Transforms>
        <ds:Transform Algorithm="${ENV_TRANSFORM}"/>
        <ds:Transform Algorithm="${C14N_ALGO}"/>
      </ds:Transforms>
      <ds:DigestMethod Algorithm="${DIGEST_ALGO}"/>
      <ds:DigestValue>${args.digestValue}</ds:DigestValue>
    </ds:Reference>
  </ds:SignedInfo>`;
}

function buildSignatureElement(args: {
  signatureId: string;
  signedInfo: string;
  signatureValue: string;
  certBase64: string;
}): string {
  return `<ds:Signature xmlns:ds="${NS_DSIG}" Id="${args.signatureId}">
  ${args.signedInfo}
  <ds:SignatureValue>${args.signatureValue}</ds:SignatureValue>
  <ds:KeyInfo>
    <ds:X509Data>
      <ds:X509Certificate>${args.certBase64}</ds:X509Certificate>
    </ds:X509Data>
  </ds:KeyInfo>
</ds:Signature>`;
}

/**
 * Canonicalization simplificada (variante de XML-C14N inclusivo).
 *
 * Hace lo mínimo para que el digest sea estable entre serializaciones idénticas:
 *  - Elimina la declaración XML
 *  - Normaliza CRLF → LF
 *  - Trim espacios externos
 *
 * NO hace ordenamiento de atributos ni resolución de namespaces. Para nuestros
 * XMLs (generados por el builder, formato estable), es suficiente.
 *
 * TODO Fase 4 prod: reemplazar por XML-C14N completo si SIFEN rechaza por digest.
 */
function c14nSimplificado(s: string): string {
  return s
    .replace(/<\?xml[^?]*\?>\s*/, '')
    .replace(/\r\n/g, '\n')
    .trim();
}
