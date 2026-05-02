import { describe, expect, it } from 'vitest';

import { discriminarIva, formatGs, parseGs } from './money.js';

describe('formatGs', () => {
  it('formatea con símbolo y separadores de miles', () => {
    expect(formatGs(1234567)).toBe('₲ 1.234.567');
    expect(formatGs(0)).toBe('₲ 0');
    expect(formatGs(1000)).toBe('₲ 1.000');
  });

  it('formatea sin símbolo si se pasa false', () => {
    expect(formatGs(1234567, false)).toBe('1.234.567');
  });

  it('acepta BigInt', () => {
    expect(formatGs(1234567n)).toBe('₲ 1.234.567');
  });

  it('trunca decimales', () => {
    expect(formatGs(1234.99)).toBe('₲ 1.234');
  });
});

describe('parseGs', () => {
  it('parsea formato local con símbolo y puntos', () => {
    expect(parseGs('₲ 1.234.567')).toBe(1234567);
    expect(parseGs('1.234.567')).toBe(1234567);
    expect(parseGs('1234567')).toBe(1234567);
    expect(parseGs('0')).toBe(0);
  });

  it('retorna NaN para inputs inválidos', () => {
    expect(parseGs('abc')).toBeNaN();
    expect(parseGs('')).toBeNaN();
    expect(parseGs('1,5')).toBeNaN();
  });
});

describe('discriminarIva', () => {
  it('discrimina IVA 10% correctamente', () => {
    // Precio con IVA = 11.000 → base 10.000, iva 1.000
    expect(discriminarIva(11_000, 10)).toEqual({ base: 10_000, iva: 1_000, total: 11_000 });
  });

  it('discrimina IVA 5% correctamente', () => {
    // Precio con IVA = 21.000 → base 20.000, iva 1.000
    expect(discriminarIva(21_000, 5)).toEqual({ base: 20_000, iva: 1_000, total: 21_000 });
  });

  it('para exentas el IVA es 0 y la base = total', () => {
    expect(discriminarIva(50_000, 0)).toEqual({ base: 50_000, iva: 0, total: 50_000 });
  });

  it('preserva el total exacto incluso con redondeo', () => {
    // Precio raro que no divide exacto por 11
    const result = discriminarIva(12_345, 10);
    expect(result.base + result.iva).toBe(12_345);
  });
});
