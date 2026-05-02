/* eslint-disable no-console */
/**
 * Genera un certificado X.509 auto-firmado para tests.
 *
 *   pnpm --filter @smash/sifen-client generar-cert-test
 *
 * Output:
 *   packages/sifen-client/test-cert/test.p12  (PKCS#12 bundle)
 *   packages/sifen-client/test-cert/test.pem  (cert public — opcional, debug)
 *
 * Password del .p12: "smash-test"
 *
 * IMPORTANTE: este cert es SOLO para tests. SIFEN producción requiere
 * un certificado emitido por una CA reconocida en Paraguay (Documenta, Camp, etc.).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import forge from 'node-forge';

const PASSWORD = 'smash-test';
const RUC_TEST = '80012345';
const RAZON_SOCIAL = 'SMASH BURGERS PARAGUAY S.A.';

async function main() {
  console.log('🔐 Generando par de claves RSA 2048...');
  const keys = forge.pki.rsa.generateKeyPair(2048);

  console.log('📜 Generando certificado auto-firmado...');
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);

  const attrs = [
    { name: 'commonName', value: RAZON_SOCIAL },
    { name: 'countryName', value: 'PY' },
    { shortName: 'ST', value: 'Asunción' },
    { name: 'localityName', value: 'Asunción' },
    { name: 'organizationName', value: RAZON_SOCIAL },
    { shortName: 'OU', value: `RUC ${RUC_TEST}` },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // auto-firmado
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    {
      name: 'keyUsage',
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
    },
    {
      name: 'extKeyUsage',
      clientAuth: true,
      emailProtection: true,
    },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 1, value: 'test@smash.com.py' }, // rfc822Name
      ],
    },
  ]);

  // Firmar el cert con su propia clave (auto-firmado) usando SHA-256
  cert.sign(keys.privateKey, forge.md.sha256.create());

  console.log('📦 Empaquetando en PKCS#12...');
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PASSWORD, {
    algorithm: '3des',
    friendlyName: 'Smash test cert',
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const p12Bytes = Buffer.from(p12Der, 'binary');

  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(here, '../test-cert');
  await mkdir(outDir, { recursive: true });

  const p12Path = resolve(outDir, 'test.p12');
  const pemPath = resolve(outDir, 'test.pem');
  await writeFile(p12Path, p12Bytes);
  await writeFile(pemPath, forge.pki.certificateToPem(cert), 'utf8');

  console.log(`✅ ${p12Path}  (password: ${PASSWORD})`);
  console.log(`✅ ${pemPath}  (cert PEM, sólo para inspección)`);
  console.log(`\nUsálo así en tests:`);
  console.log(`  import { cargarP12 } from '@smash/sifen-client';`);
  console.log(
    `  const { cert, privateKey } = cargarP12(fs.readFileSync('test.p12'), 'smash-test');`,
  );
}

void main();
