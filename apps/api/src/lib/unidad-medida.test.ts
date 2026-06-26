import { describe, expect, it } from 'vitest';

import { AppError } from './errors.js';
import {
  convertirAUnidadBase,
  convertirCantidad,
  familiaDe,
  puedeConvertirAUnidadBase,
  type UnidadInsumoSlim,
} from './unidad-medida.js';

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

describe('familiaDe', () => {
  it('agrupa por tipo de magnitud', () => {
    expect(familiaDe('GRAMO')).toBe('MASA');
    expect(familiaDe('KILOGRAMO')).toBe('MASA');
    expect(familiaDe('MILILITRO')).toBe('VOLUMEN');
    expect(familiaDe('UNIDAD')).toBe('CONTEO');
    expect(familiaDe('DOCENA')).toBe('CONTEO');
    expect(familiaDe('PORCION')).toBe('PORCION');
  });
});

describe('convertirAUnidadBase', () => {
  // Tomate: stock en UNIDAD, equivalencia "1 UNIDAD = 150 GRAMO".
  const tomate: UnidadInsumoSlim[] = [{ unidad: 'GRAMO', cantidadUnidad: 150, cantidadBase: 1 }];
  // Salsa: stock en LITRO, equivalencia "1 LITRO = 1050 GRAMO".
  const salsa: UnidadInsumoSlim[] = [{ unidad: 'GRAMO', cantidadUnidad: 1050, cantidadBase: 1 }];
  // Ajo: stock en GRAMO, equivalencia "1 UNIDAD (diente) = 5 GRAMO".
  const ajo: UnidadInsumoSlim[] = [{ unidad: 'UNIDAD', cantidadUnidad: 1, cantidadBase: 5 }];

  it('sin conversión cuando la unidad ya es la base', () => {
    expect(convertirAUnidadBase(2, 'UNIDAD', 'UNIDAD', tomate)).toBe(2);
  });

  it('misma familia: usa la conversión universal aunque haya equivalencias', () => {
    expect(convertirAUnidadBase(300, 'GRAMO', 'KILOGRAMO')).toBe(0.3);
    expect(convertirAUnidadBase(500, 'MILILITRO', 'LITRO')).toBe(0.5);
  });

  it('cruza CONTEO→MASA: 300 g de tomate = 2 unidades', () => {
    expect(convertirAUnidadBase(300, 'GRAMO', 'UNIDAD', tomate)).toBeCloseTo(2, 6);
  });

  it('cruza VOLUMEN→MASA usando una unidad-puente de otra escala (kg)', () => {
    // 2.1 kg de salsa → en gramos 2100 → / 1050 = 2 litros
    expect(convertirAUnidadBase(2.1, 'KILOGRAMO', 'LITRO', salsa)).toBeCloseTo(2, 6);
    // 300 g → 0.2857 L
    expect(convertirAUnidadBase(300, 'GRAMO', 'LITRO', salsa)).toBeCloseTo(300 / 1050, 6);
  });

  it('cruza en dirección inversa (base en MASA, equivalencia en CONTEO)', () => {
    // 3 dientes de ajo → 15 g (stock en gramos)
    expect(convertirAUnidadBase(3, 'UNIDAD', 'GRAMO', ajo)).toBeCloseTo(15, 6);
  });

  it('tira VALIDATION_ERROR si no hay equivalencia que cubra la familia', () => {
    expect(() => convertirAUnidadBase(300, 'GRAMO', 'UNIDAD')).toThrow(AppError);
    // Equivalencia en MASA no sirve para convertir desde VOLUMEN.
    expect(() => convertirAUnidadBase(300, 'MILILITRO', 'UNIDAD', tomate)).toThrow(AppError);
  });

  it('el mensaje sugiere cargar la equivalencia', () => {
    try {
      convertirAUnidadBase(300, 'GRAMO', 'UNIDAD');
      expect.fail('debería haber tirado');
    } catch (e) {
      expect((e as AppError).message).toContain('equivalencia');
      expect((e as AppError).details).toMatchObject({ desde: 'GRAMO', base: 'UNIDAD' });
    }
  });
});

describe('puedeConvertirAUnidadBase', () => {
  const tomate: UnidadInsumoSlim[] = [{ unidad: 'GRAMO', cantidadUnidad: 150, cantidadBase: 1 }];

  it('true para misma unidad y misma familia', () => {
    expect(puedeConvertirAUnidadBase('UNIDAD', 'UNIDAD')).toBe(true);
    expect(puedeConvertirAUnidadBase('GRAMO', 'KILOGRAMO')).toBe(true);
  });

  it('true cruzando familias solo si hay equivalencia', () => {
    expect(puedeConvertirAUnidadBase('GRAMO', 'UNIDAD', tomate)).toBe(true);
    expect(puedeConvertirAUnidadBase('GRAMO', 'UNIDAD')).toBe(false);
    expect(puedeConvertirAUnidadBase('MILILITRO', 'UNIDAD', tomate)).toBe(false);
  });
});
