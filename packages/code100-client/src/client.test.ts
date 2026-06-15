import { describe, expect, it, vi } from 'vitest';

import { Code100Auth } from './auth.js';
import { Code100Client, Code100RequestError } from './client.js';
import type { Code100AltaPayload, Code100Credentials } from './types.js';

const creds: Code100Credentials = {
  ruc: '12345678',
  password: 'pass',
  dominio: 'https://ws.test/',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Auth pre-cargado para no testear el login en cada caso. */
function authConToken(fetchImpl: ReturnType<typeof vi.fn>): Code100Auth {
  return new Code100Auth({
    fetchImpl: vi.fn().mockResolvedValue(jsonResponse({ token: 'tok' })),
    now: () => 0,
  });
}

const altaMinima: Code100AltaPayload = {
  tipOpe: '1',
  iTiDE: '1',
  dEst: '001',
  dPunExp: '001',
  dNumDoc: '0000001',
  dFeEmiDE: '2026-06-15T10:00:00',
  iTImp: '1',
  cMoneOpe: 'PYG',
  iNatRec: '2',
  iTiOpe: '2',
  cPaisRec: 'PRY',
  iTipIDRec: '5',
  dNumIDRec: '0',
  dNomRec: 'Sin Nombre',
  iIndPres: '1',
  iCondOpe: '1',
  Detalles: [],
  Subtotales: [],
};

describe('Code100Client', () => {
  it('altaDocumento postea a /api/operation con Bearer y tipOpe=1', async () => {
    const opFetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ status: 'success', message: 'Documento registrado exitosamente' }),
      );
    const client = new Code100Client({ fetchImpl: opFetch, auth: authConToken(opFetch) });

    const res = await client.altaDocumento(creds, altaMinima);
    expect(res.status).toBe('success');

    const [url, init] = opFetch.mock.calls[0]!;
    expect(url).toBe('https://ws.test/api/operation');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.tipOpe).toBe('1');
    expect(body.dNomRec).toBe('Sin Nombre');
  });

  it('consultarEstado parsea CDC y estado aprobado', async () => {
    const opFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'success',
        response: {
          Estado: 'Aprobado',
          DE: { CDC: '01800806107001001000008522025091015824460007', EnlaceQR: 'https://qr' },
        },
      }),
    );
    const client = new Code100Client({ fetchImpl: opFetch, auth: authConToken(opFetch) });

    const res = await client.consultarEstado(creds, {
      dEst: '001',
      dPunExp: '001',
      dNumDoc: '0000001',
      tipoDoc: 'FE',
    });
    expect(res.response?.DE?.CDC).toHaveLength(44);
  });

  it('obtenerKude envía ticket=false por default', async () => {
    const opFetch = vi.fn().mockResolvedValue(jsonResponse({ status: 'success', kude: 'base64' }));
    const client = new Code100Client({ fetchImpl: opFetch, auth: authConToken(opFetch) });

    await client.obtenerKude(creds, {
      dEst: '001',
      dPunExp: '001',
      dNumDoc: '0000001',
      tipoDoc: 'FE',
    });
    const body = JSON.parse((opFetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.ticket).toBe(false);
    expect(body.tipOpe).toBe('4');
  });

  it('reintenta una vez tras un 401 invalidando el token', async () => {
    const opFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ status: 'success' }));
    // Auth que entrega tokens distintos en cada login para verificar el refresh.
    const loginFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'tok-1' }))
      .mockResolvedValueOnce(jsonResponse({ token: 'tok-2' }));
    const auth = new Code100Auth({ fetchImpl: loginFetch, now: () => 0 });
    const client = new Code100Client({ fetchImpl: opFetch, auth });

    const res = await client.altaDocumento(creds, altaMinima);
    expect(res.status).toBe('success');
    expect(opFetch).toHaveBeenCalledTimes(2);
    expect(loginFetch).toHaveBeenCalledTimes(2); // re-login tras invalidar
  });

  it('lanza Code100RequestError ante HTTP 500', async () => {
    const opFetch = vi.fn().mockResolvedValue(jsonResponse({ message: 'boom' }, 500));
    const client = new Code100Client({ fetchImpl: opFetch, auth: authConToken(opFetch) });
    await expect(client.altaDocumento(creds, altaMinima)).rejects.toBeInstanceOf(
      Code100RequestError,
    );
  });
});
