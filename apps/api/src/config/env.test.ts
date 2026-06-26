import { describe, expect, it } from 'vitest';

import { JWT_SECRET_MIN_PROD, validarConfigProduccion } from './env.js';

const SECRETO_FUERTE = 'a'.repeat(JWT_SECRET_MIN_PROD);
const ORIGENES_OK = 'https://app.smash.com.py,https://admin.smash.com.py';

describe('validarConfigProduccion', () => {
  it('no valida nada fuera de producción', () => {
    expect(
      validarConfigProduccion({ NODE_ENV: 'development', ALLOWED_ORIGINS: '*', JWT_SECRET: 'x' }),
    ).toEqual([]);
    expect(
      validarConfigProduccion({ NODE_ENV: 'test', ALLOWED_ORIGINS: '*', JWT_SECRET: 'x' }),
    ).toEqual([]);
  });

  it('en producción rechaza ALLOWED_ORIGINS=* (incluso con espacios)', () => {
    const errs = validarConfigProduccion({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: '  *  ',
      JWT_SECRET: SECRETO_FUERTE,
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('ALLOWED_ORIGINS');
  });

  it('en producción rechaza JWT_SECRET corto', () => {
    const errs = validarConfigProduccion({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: ORIGENES_OK,
      JWT_SECRET: 'corto-pero-mayor-a-32-caracteres-x', // 34 chars, pasa el min global pero no el de prod
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('JWT_SECRET');
  });

  it('acumula múltiples errores', () => {
    const errs = validarConfigProduccion({
      NODE_ENV: 'production',
      ALLOWED_ORIGINS: '*',
      JWT_SECRET: 'corto',
    });
    expect(errs).toHaveLength(2);
  });

  it('config de producción correcta no genera errores', () => {
    expect(
      validarConfigProduccion({
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: ORIGENES_OK,
        JWT_SECRET: SECRETO_FUERTE,
      }),
    ).toEqual([]);
  });
});
