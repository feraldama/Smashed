import { describe, expect, it } from 'vitest';

import { buildEventoCancelacionXml, generarIdEvento } from './eventos.js';

const CDC_VALIDO = '01800123450010010000001220260515112345678';
// generamos uno con DV correcto:
const CDC_44 = (() => {
  // Simplemente un CDC fake que tenga 44 dígitos para que pase la validación de longitud.
  return '0'.repeat(44);
})();

describe('buildEventoCancelacionXml', () => {
  it('genera XML con namespace y CDC referenciado', () => {
    const xml = buildEventoCancelacionXml({
      cdc: CDC_44,
      motivo: 'Cliente devolvió el producto',
      idEvento: 1234567890,
    });
    expect(xml.startsWith('<?xml')).toBe(true);
    expect(xml).toContain('xmlns="http://ekuatia.set.gov.py/sifen/xsd"');
    expect(xml).toContain('<rGeVeCan>');
    expect(xml).toContain(`<Id>${CDC_44}</Id>`);
    expect(xml).toContain('<mOtEve>Cliente devolvió el producto</mOtEve>');
  });

  it('rechaza motivo demasiado corto', () => {
    expect(() => buildEventoCancelacionXml({ cdc: CDC_44, motivo: 'XX', idEvento: 1 })).toThrow(
      /5 y 500/,
    );
  });

  it('rechaza motivo demasiado largo', () => {
    expect(() =>
      buildEventoCancelacionXml({
        cdc: CDC_44,
        motivo: 'a'.repeat(501),
        idEvento: 1,
      }),
    ).toThrow(/5 y 500/);
  });

  it('rechaza CDC inválido', () => {
    expect(() =>
      buildEventoCancelacionXml({ cdc: '123', motivo: 'motivo', idEvento: 1 }),
    ).toThrow();
  });

  it('escapa caracteres especiales en motivo', () => {
    const xml = buildEventoCancelacionXml({
      cdc: CDC_44,
      motivo: 'Cliente <devolución> & error',
      idEvento: 1,
    });
    expect(xml).toContain('Cliente &lt;devolución&gt; &amp; error');
  });
});

describe('generarIdEvento', () => {
  it('genera ID determinístico para mismo CDC', () => {
    const id1 = generarIdEvento(CDC_44, 1);
    const id2 = generarIdEvento(CDC_44, 1);
    expect(id1).toBe(id2);
    expect(String(id1).length).toBeLessThanOrEqual(16);
  });

  it('IDs distintos para tipos de evento distintos sobre mismo CDC', () => {
    const cdcOk = '0'.repeat(44);
    const idCanc = generarIdEvento(cdcOk, 1);
    const idInut = generarIdEvento(cdcOk, 2);
    expect(idCanc).not.toBe(idInut);
  });
});
