import { describe, expect, it } from 'vitest';

import { buildDocumentoElectronicoXml } from './xml-builder.js';

import type { DocumentoElectronicoInput } from './types.js';

const baseInput: DocumentoElectronicoInput = {
  tipoDocumento: 1,
  numeroDocumento: 1,
  fechaEmision: new Date('2026-05-15T12:00:00-03:00'),
  tipoEmision: 1,
  codigoSeguridad: '123456789',

  tipoTransaccion: 1,
  condicionVenta: 1,
  tipoOperacion: 2, // B2C
  indicadorPresencia: 1,

  emisor: {
    ruc: '80012345',
    dv: '0',
    razonSocial: 'SMASH BURGERS PARAGUAY S.A.',
    direccion: 'Palma 525 c/ 14 de Mayo',
    ciudad: 'Asunción',
    tipoContribuyente: 2,
    establecimiento: '001',
    puntoExpedicion: '001',
  },

  receptor: {
    tipoOperacion: 2,
    razonSocial: 'SIN NOMBRE',
    pais: 'PRY',
  },

  items: [
    {
      codigo: 'HAM-001',
      descripcion: 'Smash Clásica',
      unidadMedida: 77,
      cantidad: 2,
      precioUnitario: 35000n,
      tasaIva: 10,
    },
    {
      codigo: 'BEB-001',
      descripcion: 'Coca-Cola 500ml',
      unidadMedida: 77,
      cantidad: 1,
      precioUnitario: 10000n,
      tasaIva: 10,
    },
  ],

  condicionPago: [{ metodo: 1, monto: 80000n }],
};

describe('buildDocumentoElectronicoXml', () => {
  const cdc = '01800123450010010000001220260515112345678'; // 41 chars + 3 → 44 ish; placeholder
  const cdcReal = '0180012345001100100000012202605151123456789';
  // Para tests no necesita ser válido — sólo se inserta como Id.
  const cdcFake = '0'.repeat(44);

  it('genera XML con declaración + namespace SIFEN', () => {
    const xml = buildDocumentoElectronicoXml({ cdc: cdcFake, doc: baseInput });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns="http://ekuatia.set.gov.py/sifen/xsd"');
    expect(xml).toContain('<rDE');
    expect(xml).toContain('<dVerFor>150</dVerFor>');
  });

  it('incluye el CDC como Id del DE', () => {
    const xml = buildDocumentoElectronicoXml({ cdc: cdcFake, doc: baseInput });
    expect(xml).toContain(`Id="DE${cdcFake}"`);
    expect(xml).toContain(`<Id>${cdcFake}</Id>`);
  });

  it('incluye datos del emisor con escape XML', () => {
    const xml = buildDocumentoElectronicoXml({
      cdc: cdcFake,
      doc: { ...baseInput, emisor: { ...baseInput.emisor, razonSocial: 'A & B SRL' } },
    });
    expect(xml).toContain('<dRucEm>80012345</dRucEm>');
    expect(xml).toContain('<dDVEmi>0</dDVEmi>');
    expect(xml).toContain('A &amp; B SRL');
  });

  it('serializa items con totales correctos', () => {
    const xml = buildDocumentoElectronicoXml({ cdc: cdcFake, doc: baseInput });
    // Smash Clásica × 2 = 70000
    expect(xml).toContain('<dTotOpeItem>70000</dTotOpeItem>');
    expect(xml).toContain('<dTotOpeItem>10000</dTotOpeItem>');
    // IVA item Smash: 70000 / 11 = 6364
    expect(xml).toContain('<dLiqIVAItem>6364</dLiqIVAItem>');
  });

  it('totales generales correctos', () => {
    const xml = buildDocumentoElectronicoXml({ cdc: cdcFake, doc: baseInput });
    // Total = 80000
    expect(xml).toContain('<dTotGralOpe>80000</dTotGralOpe>');
    expect(xml).toContain('<dTotalGs>80000</dTotalGs>');
    // IVA total = 6364 + 909 = 7273 (10000 / 11 = 909)
    expect(xml).toContain('<dTotIVA>7273</dTotIVA>');
  });

  it('para nota de crédito (tipoDoc=5) incluye motivo y referencia', () => {
    const xml = buildDocumentoElectronicoXml({
      cdc: cdcFake,
      doc: {
        ...baseInput,
        tipoDocumento: 5,
        motivoEmision: 1,
        comprobanteAsociado: { cdc: '0'.repeat(44), formato: 1 },
      },
    });
    expect(xml).toContain('<gCamNCDE>');
    expect(xml).toContain('<iMotEmi>1</iMotEmi>');
    expect(xml).toContain('<gCamDEAsoc>');
  });

  it('para receptor con RUC incluye dRucRec/dDVRec', () => {
    const xml = buildDocumentoElectronicoXml({
      cdc: cdcFake,
      doc: {
        ...baseInput,
        tipoOperacion: 1,
        receptor: {
          tipoOperacion: 1,
          razonSocial: 'CONSULTORA EJEMPLO S.A.',
          ruc: '80056789',
          dv: '7',
          tipoContribuyente: 2,
          pais: 'PRY',
        },
      },
    });
    expect(xml).toContain('<dRucRec>80056789</dRucRec>');
    expect(xml).toContain('<dDVRec>7</dDVRec>');
  });

  // Helpers for type-checking
  void cdc;
  void cdcReal;
});
