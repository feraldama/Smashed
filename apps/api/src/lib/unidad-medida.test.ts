import { describe, expect, it } from 'vitest';

import { AppError } from './errors.js';
import { convertirCantidad } from './unidad-medida.js';

describe('convertirCantidad', () => {
  it('misma unidad: factor 1', () => {
    expect(convertirCantidad(300, 'GRAMO', 'GRAMO')).toBe(300);
    expect(convertirCantidad(0, 'KILOGRAMO', 'KILOGRAMO')).toBe(0);
  });

  it('masa: GRAMO ↔ KILOGRAMO', () => {
    expect(convertirCantidad(300, 'GRAMO', 'KILOGRAMO')).toBe(0.3);
    expect(convertirCantidad(2, 'KILOGRAMO', 'GRAMO')).toBe(2000);
    expect(convertirCantidad(1, 'GRAMO', 'KILOGRAMO')).toBe(0.001);
  });

  it('volumen: MILILITRO ↔ LITRO', () => {
    expect(convertirCantidad(500, 'MILILITRO', 'LITRO')).toBe(0.5);
    expect(convertirCantidad(1.5, 'LITRO', 'MILILITRO')).toBe(1500);
  });

  it('conteo: DOCENA ↔ UNIDAD', () => {
    expect(convertirCantidad(2, 'DOCENA', 'UNIDAD')).toBe(24);
    expect(convertirCantidad(36, 'UNIDAD', 'DOCENA')).toBe(3);
  });

  it('tira VALIDATION_ERROR al mezclar familias incompatibles', () => {
    expect(() => convertirCantidad(1, 'GRAMO', 'UNIDAD')).toThrow(AppError);
    expect(() => convertirCantidad(1, 'KILOGRAMO', 'MILILITRO')).toThrow(AppError);
    expect(() => convertirCantidad(1, 'PORCION', 'GRAMO')).toThrow(AppError);
    expect(() => convertirCantidad(1, 'UNIDAD', 'LITRO')).toThrow(AppError);
  });

  it('PORCION sólo compatible consigo misma', () => {
    expect(convertirCantidad(2, 'PORCION', 'PORCION')).toBe(2);
    expect(() => convertirCantidad(2, 'PORCION', 'UNIDAD')).toThrow(AppError);
    expect(() => convertirCantidad(2, 'UNIDAD', 'PORCION')).toThrow(AppError);
  });

  it('mensaje del error nombra las unidades', () => {
    try {
      convertirCantidad(1, 'GRAMO', 'UNIDAD');
      expect.fail('debería haber tirado');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.message).toContain('GRAMO');
      expect(err.message).toContain('UNIDAD');
      expect(err.details).toMatchObject({ desde: 'GRAMO', hacia: 'UNIDAD' });
    }
  });
});
