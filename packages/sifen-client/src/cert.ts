import forge from 'node-forge';

/**
 * Carga y manipulación de certificados X.509 para firma SIFEN.
 *
 * Para producción se usa un .p12 emitido por una CA reconocida en Paraguay.
 * Para tests, generar uno con `pnpm --filter @smash/sifen-client generar-cert-test`.
 */

export interface CertCargado {
  cert: forge.pki.Certificate;
  privateKey: forge.pki.rsa.PrivateKey;
  /** Cert en base64 DER (formato esperado por el campo ds:X509Certificate) */
  certBase64: string;
  /** Razón social / commonName extraída del subject */
  subjectCN: string;
  /** Vigente hasta */
  notAfter: Date;
}

/**
 * Carga un PKCS#12 (.p12 o .pfx) con su clave privada y certificado.
 *
 * @param p12Bytes contenido binario del .p12 (Buffer)
 * @param password contraseña del .p12
 */
export function cargarP12(p12Bytes: Buffer, password: string): CertCargado {
  const p12Der = p12Bytes.toString('binary');
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  // Extraer el primer cert + clave privada. Los OIDs vienen tipados como
  // `string | undefined` pero forge los define siempre — falla el build de forge
  // si alguna falta, así que un guard ya cubre el caso degenerado.
  const certBagOid = forge.pki.oids.certBag;
  const keyBagOid = forge.pki.oids.pkcs8ShroudedKeyBag;
  if (!certBagOid || !keyBagOid) {
    throw new Error('OIDs de forge no disponibles — versión de node-forge corrupta');
  }
  const certBags = p12.getBags({ bagType: certBagOid });
  const keyBags = p12.getBags({ bagType: keyBagOid });

  const cert = certBags[certBagOid]?.[0]?.cert;
  const privateKeyBag = keyBags[keyBagOid]?.[0];

  if (!cert) throw new Error('No se encontró certificado en el .p12');
  if (!privateKeyBag?.key) throw new Error('No se encontró clave privada en el .p12');

  const privateKey = privateKeyBag.key;

  // Verificar que la clave sea RSA (SIFEN sólo acepta RSA con SHA-256)
  if (!('e' in privateKey) || !('n' in privateKey)) {
    throw new Error('La clave privada del .p12 no es RSA');
  }

  // Extraer cert en base64 DER
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const certBase64 = forge.util.encode64(certDer);

  // Extraer commonName del subject
  const cnAttr = cert.subject.getField('CN');
  const subjectCN = cnAttr ? cnAttr.value : '';

  return {
    cert,
    privateKey,
    certBase64,
    subjectCN,
    notAfter: cert.validity.notAfter,
  };
}

/**
 * Verifica que un certificado esté vigente (no vencido).
 */
export function estaVigente(cargado: CertCargado, ahora = new Date()): boolean {
  return ahora >= cargado.cert.validity.notBefore && ahora <= cargado.cert.validity.notAfter;
}
