import { describe, expect, it } from 'vitest';

import { errorDeAlta, normalizarEstado, tipoDocAbrev } from './estado.js';
import type { Code100ConsultaResponse } from './types.js';

describe('normalizarEstado', () => {
  it('documento aprobado', () => {
    // Tomado del manual del webservice (respuesta satisfactoria, documento aprobado).
    const res: Code100ConsultaResponse = {
      status: 'success',
      response: {
        Estado: 'Aprobado',
        FechaRegistro: '10-09-2025 10:29:46',
        DE: {
          CDC: '01800806107001001000008522025091015824460007',
          EnlaceQR: 'https://ekuatia.set.gov.py/consultas-test/qr?x=1',
          Retorno: { CodRespuesta: '0260', Protocolo: '47623335', Mensaje: 'Aprobado' },
          Evento: [],
        },
      },
    };
    const n = normalizarEstado(res);
    expect(n.estado).toBe('APROBADO');
    expect(n.procesado).toBe(true);
    expect(n.cdc).toHaveLength(44);
    expect(n.protocolo).toBe('47623335');
    expect(n.enlaceQr).toContain('qr?');
  });

  it('documento rechazado', () => {
    const res: Code100ConsultaResponse = {
      status: 'success',
      response: {
        Estado: 'Rechazado',
        DE: {
          CDC: '01800806107001001000000122022100615051336660',
          Retorno: { CodRespuesta: '1002', Mensaje: 'Documento electrónico duplicado' },
        },
      },
    };
    const n = normalizarEstado(res);
    expect(n.estado).toBe('RECHAZADO');
    expect(n.procesado).toBe(true);
    expect(n.mensaje).toContain('duplicado');
  });

  it('documento con evento de cancelación aprobado → CANCELADO', () => {
    const res: Code100ConsultaResponse = {
      status: 'success',
      response: {
        Estado: 'Aprobado',
        DE: {
          CDC: '01800806107001001000006922025090112639524055',
          Evento: [{ tipo: 'ECAN', estado: 'Aprobado', motivo: 'Los datos son incorrectos' }],
        },
      },
    };
    expect(normalizarEstado(res).estado).toBe('CANCELADO');
  });

  it('estado intermedio (XML firmado) → PENDIENTE no procesado', () => {
    const res: Code100ConsultaResponse = {
      status: 'success',
      response: { Estado: 'XML firmado', DE: {} },
    };
    const n = normalizarEstado(res);
    expect(n.estado).toBe('PENDIENTE');
    expect(n.procesado).toBe(false);
  });

  it('error → NO_ENCONTRADO', () => {
    const res: Code100ConsultaResponse = {
      status: 'error',
      message: 'Número de documento no encontrado',
    };
    expect(normalizarEstado(res).estado).toBe('NO_ENCONTRADO');
  });
});

describe('errorDeAlta', () => {
  it('success → null', () => {
    expect(errorDeAlta({ status: 'success', message: 'ok' })).toBeNull();
  });

  it('error con message string', () => {
    expect(errorDeAlta({ status: 'error', message: 'Número de documento no encontrado' })).toBe(
      'Número de documento no encontrado',
    );
  });

  it('rechazo de validación con objeto de campos en message', () => {
    const msg = errorDeAlta({
      status: 'error',
      message: { iNatRec: ['El campo iNatRec es obligatorio.'] },
    });
    expect(msg).toContain('iNatRec');
    expect(msg).toContain('obligatorio');
  });

  it('rechazo de validación con campos en la raíz', () => {
    // Respuesta de rechazo del manual: { "iTiDE": "Es obligatorio informar el Tipo de documento" }
    const msg = errorDeAlta({
      status: 'error',
      iTiDE: 'Es obligatorio informar el Tipo de documento',
    });
    expect(msg).toContain('iTiDE');
  });
});

describe('tipoDocAbrev', () => {
  it('mapea iTiDE a la abreviatura', () => {
    expect(tipoDocAbrev('1')).toBe('FE');
    expect(tipoDocAbrev('5')).toBe('NCR');
    expect(tipoDocAbrev('6')).toBe('NDE');
    expect(tipoDocAbrev('7')).toBe('REM');
    expect(tipoDocAbrev('4')).toBe('AUT');
  });
});
