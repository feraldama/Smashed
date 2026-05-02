import { describe, expect, it } from 'vitest';

import { generarQrUrl } from './qr.js';

describe('generarQrUrl', () => {
  const baseInput = {
    cdc: '01800123450001001000000122026051519012345671',
    fechaEmision: new Date('2026-05-15T12:30:45-03:00'),
    receptor: { ruc: '80056789', dv: '7' },
    totalGeneral: 80000n,
    totalIva: 7273n,
    cantidadItems: 2,
    digestValue: 'abcdef1234567890',
    idCSC: '0001',
    csc: 'ABCDEF0123456789ABCDEF0123456789',
  };

  it('arma URL con todos los parámetros obligatorios', () => {
    const url = generarQrUrl(baseInput);
    expect(url).toContain('https://ekuatia.set.gov.py/consultas/qr?');
    expect(url).toContain('nVersion=150');
    expect(url).toContain(`Id=${baseInput.cdc}`);
    expect(url).toContain('dRucRec=80056789');
    expect(url).toContain('dDVRec=7');
    expect(url).toContain('dTotGralOpe=80000');
    expect(url).toContain('dTotIVA=7273');
    expect(url).toContain('cItems=2');
    expect(url).toContain('DigestValue=abcdef1234567890');
    expect(url).toContain('IdCSC=0001');
    expect(url).toMatch(/&cHashQR=[a-f0-9]{64}$/);
  });

  it('para receptor sin RUC usa dNumIDRec', () => {
    const url = generarQrUrl({
      ...baseInput,
      receptor: { documento: '1234567' },
    });
    expect(url).toContain('dNumIDRec=1234567');
    expect(url).not.toContain('dRucRec=');
  });

  it('cHashQR cambia si cambia algún input', () => {
    const url1 = generarQrUrl(baseInput);
    const url2 = generarQrUrl({ ...baseInput, totalGeneral: 80001n });
    // Extraer hashes
    const h1 = url1.match(/cHashQR=([a-f0-9]+)/)![1];
    const h2 = url2.match(/cHashQR=([a-f0-9]+)/)![1];
    expect(h1).not.toBe(h2);
  });

  it('cHashQR cambia si cambia el CSC (mismo input)', () => {
    const url1 = generarQrUrl(baseInput);
    const url2 = generarQrUrl({ ...baseInput, csc: 'OTRO_CSC_DIFERENTE_AAAAAAAAAA' });
    const h1 = url1.match(/cHashQR=([a-f0-9]+)/)![1];
    const h2 = url2.match(/cHashQR=([a-f0-9]+)/)![1];
    expect(h1).not.toBe(h2);
  });
});
