/**
 * Tests de firma XAdES-BES.
 *
 * Requiere que el cert auto-firmado esté generado:
 *   pnpm --filter @smash/sifen-client generar-cert-test
 *
 * Ese script crea packages/sifen-client/test-cert/test.p12 (password "smash-test").
 * Si no existe, los tests se saltean con un skip informativo.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { calcularCdc } from './cdc.js';
import { cargarP12, estaVigente, type CertCargado } from './cert.js';
import { firmarXmlSifen, verificarFirma } from './firma.js';
import { buildDocumentoElectronicoXml } from './xml-builder.js';

import type { DocumentoElectronicoInput } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const P12_PATH = resolve(here, '../test-cert/test.p12');
const P12_PASSWORD = 'smash-test';

const P12_DISPONIBLE = existsSync(P12_PATH);

let cert: CertCargado;

beforeAll(() => {
  if (!P12_DISPONIBLE) {
    console.warn(
      `\n⚠ Cert de test no encontrado en ${P12_PATH}. Corré:\n  pnpm --filter @smash/sifen-client generar-cert-test\n`,
    );
    return;
  }
  cert = cargarP12(readFileSync(P12_PATH), P12_PASSWORD);
});

afterAll(() => {
  /* nada */
});

describe.skipIf(!P12_DISPONIBLE)('cargarP12', () => {
  it('carga cert + clave privada', () => {
    expect(cert.cert).toBeDefined();
    expect(cert.privateKey).toBeDefined();
    expect(cert.certBase64).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('extrae CN del subject', () => {
    expect(cert.subjectCN).toContain('SMASH');
  });

  it('cert vigente', () => {
    expect(estaVigente(cert)).toBe(true);
  });

  it('falla con password incorrecta', () => {
    expect(() => cargarP12(readFileSync(P12_PATH), 'mal-password')).toThrow();
  });
});

const baseDoc: DocumentoElectronicoInput = {
  tipoDocumento: 1,
  numeroDocumento: 1,
  fechaEmision: new Date('2026-05-15T12:00:00-03:00'),
  tipoEmision: 1,
  codigoSeguridad: '123456789',
  tipoTransaccion: 1,
  condicionVenta: 1,
  tipoOperacion: 2,
  indicadorPresencia: 1,
  emisor: {
    ruc: '80012345',
    dv: '0',
    razonSocial: 'SMASH BURGERS PARAGUAY S.A.',
    direccion: 'Palma 525',
    ciudad: 'Asunción',
    tipoContribuyente: 2,
    establecimiento: '001',
    puntoExpedicion: '001',
  },
  receptor: { tipoOperacion: 2, razonSocial: 'SIN NOMBRE', pais: 'PRY' },
  items: [
    {
      codigo: 'HAM-001',
      descripcion: 'Smash Clásica',
      unidadMedida: 77,
      cantidad: 1,
      precioUnitario: 35000n,
      tasaIva: 10,
    },
  ],
};

describe.skipIf(!P12_DISPONIBLE)('firmarXmlSifen', () => {
  it('inserta <ds:Signature> dentro del <rDE>', () => {
    const cdc = calcularCdc({
      tipoDocumento: 1,
      rucEmisor: baseDoc.emisor.ruc,
      dvEmisor: baseDoc.emisor.dv,
      establecimiento: baseDoc.emisor.establecimiento,
      puntoExpedicion: baseDoc.emisor.puntoExpedicion,
      numeroDocumento: 1,
      tipoContribuyente: 2,
      fechaEmision: baseDoc.fechaEmision,
      tipoEmision: 1,
      codigoSeguridad: '123456789',
    });
    const xml = buildDocumentoElectronicoXml({ cdc, doc: baseDoc });

    const result = firmarXmlSifen({ xml, cert });

    expect(result.xmlFirmado).toContain('<ds:Signature');
    expect(result.xmlFirmado).toContain('<ds:SignedInfo>');
    expect(result.xmlFirmado).toContain('<ds:SignatureValue>');
    expect(result.xmlFirmado).toContain('<ds:X509Certificate>');
    expect(result.xmlFirmado).toContain('</rDE>');
    // El Signature está antes del cierre rDE
    const idxSig = result.xmlFirmado.indexOf('<ds:Signature');
    const idxClose = result.xmlFirmado.lastIndexOf('</rDE>');
    expect(idxSig).toBeGreaterThan(0);
    expect(idxSig).toBeLessThan(idxClose);
  });

  it('digestValue es base64 SHA-256 (44 chars)', () => {
    const cdc = '0'.repeat(44);
    const xml = buildDocumentoElectronicoXml({ cdc, doc: baseDoc });
    const result = firmarXmlSifen({ xml, cert });
    // SHA-256 base64 termina en "=" y tiene exactamente 44 caracteres
    expect(result.digestValue).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });

  it('el mismo XML produce el mismo digest (determinístico)', () => {
    const cdc = '0'.repeat(44);
    const xml = buildDocumentoElectronicoXml({ cdc, doc: baseDoc });
    const r1 = firmarXmlSifen({ xml, cert });
    const r2 = firmarXmlSifen({ xml, cert });
    expect(r1.digestValue).toBe(r2.digestValue);
    // signatureValue cambia? Sí porque el padding RSA-PKCS1 puede usar random,
    // pero RSA-SHA256 con node crypto es determinístico (no PSS), debería ser igual.
    // Si en algún ambiente difiere, este test puede relajarse a sólo comparar digest.
  });

  it('cambio en el XML cambia el digest', () => {
    const cdc = '0'.repeat(44);
    const xml1 = buildDocumentoElectronicoXml({ cdc, doc: baseDoc });
    const docModif = { ...baseDoc, items: [{ ...baseDoc.items[0]!, cantidad: 2 }] };
    const xml2 = buildDocumentoElectronicoXml({ cdc, doc: docModif });
    const r1 = firmarXmlSifen({ xml: xml1, cert });
    const r2 = firmarXmlSifen({ xml: xml2, cert });
    expect(r1.digestValue).not.toBe(r2.digestValue);
  });
});

describe.skipIf(!P12_DISPONIBLE)('verificarFirma', () => {
  it('valida firma generada por nosotros mismos', () => {
    const cdc = '0'.repeat(44);
    const xml = buildDocumentoElectronicoXml({ cdc, doc: baseDoc });
    const { xmlFirmado } = firmarXmlSifen({ xml, cert });

    const result = verificarFirma(xmlFirmado);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('detecta tampering del XML firmado', () => {
    const cdc = '0'.repeat(44);
    const xml = buildDocumentoElectronicoXml({ cdc, doc: baseDoc });
    const { xmlFirmado } = firmarXmlSifen({ xml, cert });

    // Modificar el SignatureValue
    const adulterado = xmlFirmado.replace(
      /<ds:SignatureValue>([^<]+)<\/ds:SignatureValue>/,
      '<ds:SignatureValue>AAAA</ds:SignatureValue>',
    );

    const result = verificarFirma(adulterado);
    expect(result.valid).toBe(false);
  });

  it('XML sin Signature → error claro', () => {
    const result = verificarFirma('<rDE><DE Id="x">algo</DE></rDE>');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Signature/);
  });
});
