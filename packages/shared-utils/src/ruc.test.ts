import { describe, expect, it } from 'vitest';

import { calcularDvRuc, parseRucCompleto, validarRuc } from './ruc.js';

describe('calcularDvRuc', () => {
  it('calcula DV correctamente para casos conocidos', () => {
    // Casos verificados con el algoritmo SET (módulo 11, factores cíclicos 2..11).
    expect(calcularDvRuc('80000000')).toBe(5);
    expect(calcularDvRuc('5000001')).toBe(2);
    expect(calcularDvRuc('1234567')).toBe(9);
    expect(calcularDvRuc('80012345')).toBe(0); // resto < 2 → DV = 0
  });

  it('lanza error con string vacío', () => {
    expect(() => calcularDvRuc('')).toThrow();
    expect(() => calcularDvRuc('   ')).toThrow();
  });

  it('limpia caracteres no numéricos', () => {
    expect(calcularDvRuc('1.234.567')).toBe(calcularDvRuc('1234567'));
  });
});

describe('validarRuc', () => {
  it('retorna true para RUC con DV válido', () => {
    const dv = calcularDvRuc('1234567');
    expect(validarRuc('1234567', dv)).toBe(true);
    expect(validarRuc('1234567', String(dv))).toBe(true);
  });

  it('retorna false para DV incorrecto', () => {
    const dv = calcularDvRuc('1234567');
    const wrongDv = (dv + 1) % 10;
    expect(validarRuc('1234567', wrongDv)).toBe(false);
  });

  it('retorna false para inputs inválidos', () => {
    expect(validarRuc('', 0)).toBe(false);
    expect(validarRuc('1234567', 'X')).toBe(false);
    expect(validarRuc('1234567', -1)).toBe(false);
    expect(validarRuc('1234567', 10)).toBe(false);
  });
});

describe('parseRucCompleto', () => {
  it('parsea formato "RUC-DV" válido', () => {
    const dv = calcularDvRuc('1234567');
    const result = parseRucCompleto(`1234567-${dv}`);
    expect(result).toEqual({ ruc: '1234567', dv: String(dv) });
  });

  it('retorna null para formato inválido', () => {
    expect(parseRucCompleto('1234567')).toBeNull();
    expect(parseRucCompleto('1234567-')).toBeNull();
    expect(parseRucCompleto('-8')).toBeNull();
    expect(parseRucCompleto('abc-1')).toBeNull();
  });

  it('retorna null si DV no coincide', () => {
    const dv = calcularDvRuc('1234567');
    const wrongDv = (dv + 1) % 10;
    expect(parseRucCompleto(`1234567-${wrongDv}`)).toBeNull();
  });
});
