import { describe, expect, it } from 'vitest';

import {
  calcularCdc,
  calcularDvModulo11,
  formatYYYYMMDD,
  generarCodigoSeguridad,
  parsearCdc,
  verificarCdc,
} from './cdc.js';

describe('calcularDvModulo11', () => {
  it('retorna 0 cuando resto < 2', () => {
    // Caso conocido: para "80012345" el algoritmo de RUC da DV 0.
    expect(calcularDvModulo11('80012345')).toBe(0);
  });

  it('retorna 11-resto cuando resto >= 2', () => {
    // RUC 80000000 → DV 5 (verificado en shared-utils tests)
    expect(calcularDvModulo11('80000000')).toBe(5);
  });

  it('rechaza no-dígitos', () => {
    expect(() => calcularDvModulo11('abc')).toThrow();
  });
});

describe('calcularCdc', () => {
  const baseInput = {
    tipoDocumento: 1 as const,
    rucEmisor: '80012345',
    dvEmisor: '0',
    establecimiento: '001',
    puntoExpedicion: '001',
    numeroDocumento: 1,
    tipoContribuyente: 2 as const,
    fechaEmision: new Date('2026-05-15T12:00:00-03:00'),
    tipoEmision: 1 as const,
    codigoSeguridad: '123456789',
  };

  it('genera un CDC de exactamente 44 dígitos', () => {
    const cdc = calcularCdc(baseInput);
    expect(cdc).toHaveLength(44);
    expect(/^\d{44}$/.test(cdc)).toBe(true);
  });

  it('CDC verificable (DV correcto)', () => {
    const cdc = calcularCdc(baseInput);
    expect(verificarCdc(cdc)).toBe(true);
  });

  it('cambios en cualquier campo cambian el CDC', () => {
    const cdc1 = calcularCdc(baseInput);
    const cdc2 = calcularCdc({ ...baseInput, numeroDocumento: 2 });
    expect(cdc1).not.toBe(cdc2);
  });

  it('parsearCdc reversa los componentes', () => {
    const cdc = calcularCdc(baseInput);
    const parsed = parsearCdc(cdc);
    expect(parsed.tipoDocumento).toBe(1);
    expect(parsed.rucEmisor).toBe('80012345');
    expect(parsed.dvEmisor).toBe('0');
    expect(parsed.establecimiento).toBe('001');
    expect(parsed.puntoExpedicion).toBe('001');
    expect(parsed.numeroDocumento).toBe('0000001');
    expect(parsed.tipoContribuyente).toBe(2);
    expect(parsed.fechaEmision).toBe('20260515');
    expect(parsed.tipoEmision).toBe(1);
    expect(parsed.codigoSeguridad).toBe('123456789');
  });

  it('rechaza RUC no numérico', () => {
    expect(() => calcularCdc({ ...baseInput, rucEmisor: 'ABCD1234' })).toThrow();
  });

  it('rechaza código de seguridad inválido', () => {
    expect(() => calcularCdc({ ...baseInput, codigoSeguridad: '12345' })).toThrow();
  });

  it('estructura interna: tipo doc 5 (NC) en posiciones 0-1', () => {
    const cdc = calcularCdc({ ...baseInput, tipoDocumento: 5 });
    expect(cdc.slice(0, 2)).toBe('05');
  });
});

describe('verificarCdc', () => {
  it('retorna false si DV no coincide', () => {
    const cdcOriginal = calcularCdc({
      tipoDocumento: 1,
      rucEmisor: '80012345',
      dvEmisor: '0',
      establecimiento: '001',
      puntoExpedicion: '001',
      numeroDocumento: 1,
      tipoContribuyente: 2,
      fechaEmision: new Date('2026-05-15T12:00:00-03:00'),
      tipoEmision: 1,
      codigoSeguridad: '123456789',
    });

    // Cambiar el último dígito (DV) intencionalmente
    const dvOriginal = Number(cdcOriginal.slice(-1));
    const dvIncorrecto = (dvOriginal + 1) % 10;
    const cdcMal = cdcOriginal.slice(0, -1) + dvIncorrecto;
    expect(verificarCdc(cdcMal)).toBe(false);
  });

  it('retorna false si longitud != 44', () => {
    expect(verificarCdc('123')).toBe(false);
  });
});

describe('generarCodigoSeguridad', () => {
  it('genera 9 dígitos numéricos', () => {
    for (let i = 0; i < 5; i += 1) {
      const code = generarCodigoSeguridad();
      expect(code).toHaveLength(9);
      expect(/^\d{9}$/.test(code)).toBe(true);
    }
  });
});

describe('formatYYYYMMDD', () => {
  it('formatea en TZ Asunción', () => {
    // 15 de mayo 2026, 12:00 GMT-03:00 → "20260515"
    const d = new Date('2026-05-15T12:00:00-03:00');
    expect(formatYYYYMMDD(d)).toBe('20260515');
  });

  it('cruza medianoche en UTC pero mantiene fecha local PY', () => {
    // 16 mayo 02:00 UTC = 15 mayo 23:00 Asunción
    const d = new Date('2026-05-16T02:00:00Z');
    expect(formatYYYYMMDD(d)).toBe('20260515');
  });
});
