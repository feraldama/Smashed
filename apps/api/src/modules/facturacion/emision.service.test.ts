import { describe, expect, it, vi } from 'vitest';

import { intentarAlta, pollEstado } from './emision.service.js';

import type {
  Code100ConsultaPayload,
  Code100ConsultaResponse,
  Code100Credentials,
} from '@smash/code100-client';

const creds: Code100Credentials = { ruc: '12345678', password: 'x', dominio: 'https://ws.test' };
const consulta: Code100ConsultaPayload = {
  dEst: '001',
  dPunExp: '001',
  dNumDoc: '0000001',
  tipoDoc: 'FE',
};

const noSleep = () => Promise.resolve();

function consultaResp(estado: string, cdc?: string): Code100ConsultaResponse {
  return {
    status: 'success',
    response: {
      Estado: estado,
      DE: cdc ? { CDC: cdc, EnlaceQR: 'https://qr', Retorno: { Protocolo: '123' } } : {},
    },
  };
}

describe('intentarAlta', () => {
  it('devuelve null cuando el alta fue exitosa', async () => {
    const client = {
      altaDocumento: vi.fn().mockResolvedValue({ status: 'success', message: 'ok' }),
    };
    expect(await intentarAlta(client, creds, {} as never)).toBeNull();
  });

  it('devuelve el mensaje de error cuando fue rechazada', async () => {
    const client = {
      altaDocumento: vi.fn().mockResolvedValue({
        status: 'error',
        message: { iTiDE: ['obligatorio'] },
      }),
    };
    const err = await intentarAlta(client, creds, {} as never);
    expect(err).toContain('iTiDE');
  });
});

describe('pollEstado', () => {
  it('devuelve APROBADO en cuanto SIFEN procesa', async () => {
    const client = {
      consultarEstado: vi
        .fn()
        .mockResolvedValueOnce(consultaResp('XML firmado'))
        .mockResolvedValueOnce(consultaResp('Aprobado', '0'.repeat(44))),
    };
    const r = await pollEstado({ client, creds, consulta, sleep: noSleep, maxIntentos: 5 });
    expect(r.estado).toBe('APROBADO');
    expect(r.cdc).toHaveLength(44);
    expect(client.consultarEstado).toHaveBeenCalledTimes(2);
  });

  it('devuelve RECHAZADO y deja de consultar', async () => {
    const client = {
      consultarEstado: vi.fn().mockResolvedValue(consultaResp('Rechazado')),
    };
    const r = await pollEstado({ client, creds, consulta, sleep: noSleep, maxIntentos: 5 });
    expect(r.estado).toBe('RECHAZADO');
    expect(client.consultarEstado).toHaveBeenCalledTimes(1);
  });

  it('agota intentos y queda PENDIENTE si SIFEN no procesa', async () => {
    const client = {
      consultarEstado: vi.fn().mockResolvedValue(consultaResp('XML firmado')),
    };
    const r = await pollEstado({ client, creds, consulta, sleep: noSleep, maxIntentos: 3 });
    expect(r.estado).toBe('PENDIENTE');
    expect(r.procesado).toBe(false);
    expect(client.consultarEstado).toHaveBeenCalledTimes(3);
  });

  it('respeta el delay entre consultas (no duerme tras la última)', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = { consultarEstado: vi.fn().mockResolvedValue(consultaResp('XML firmado')) };
    await pollEstado({ client, creds, consulta, sleep, maxIntentos: 3, delayMs: () => 100 });
    // 3 consultas → 2 sleeps (no duerme después de la última).
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(100);
  });
});
