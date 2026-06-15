import { describe, expect, it, vi } from 'vitest';

import { Code100Auth, Code100AuthError } from './auth.js';
import type { Code100Credentials } from './types.js';

const creds: Code100Credentials = {
  ruc: '12345678',
  password: 'ABC#12345678',
  dominio: 'https://ws.test',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Code100Auth', () => {
  it('obtiene y cachea el token, sin re-loguear dentro del TTL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ token: 'tok-1' }));
    const auth = new Code100Auth({ fetchImpl, now: () => 1_000 });

    expect(await auth.getToken(creds)).toBe('tok-1');
    expect(await auth.getToken(creds)).toBe('tok-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ws.test/api/autenticate',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('re-loguea cuando el token expiró', async () => {
    let now = 0;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'tok-1' }))
      .mockResolvedValueOnce(jsonResponse({ token: 'tok-2' }));
    const auth = new Code100Auth({ fetchImpl, now: () => now });

    expect(await auth.getToken(creds)).toBe('tok-1');
    now = 2 * 60 * 60 * 1000; // +2h: expirado
    expect(await auth.getToken(creds)).toBe('tok-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('coalesce logins concurrentes en una sola llamada', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise<Response>((r) => setTimeout(() => r(jsonResponse({ token: 'tok-1' })), 5)),
      );
    const auth = new Code100Auth({ fetchImpl, now: () => 0 });

    const [a, b] = await Promise.all([auth.getToken(creds), auth.getToken(creds)]);
    expect(a).toBe('tok-1');
    expect(b).toBe('tok-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('cachea por RUC distinto de forma independiente', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'tok-A' }))
      .mockResolvedValueOnce(jsonResponse({ token: 'tok-B' }));
    const auth = new Code100Auth({ fetchImpl, now: () => 0 });

    expect(await auth.getToken(creds)).toBe('tok-A');
    expect(await auth.getToken({ ...creds, ruc: '87654321' })).toBe('tok-B');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('lanza Code100AuthError ante credenciales inválidas', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'credenciales' }, 401));
    const auth = new Code100Auth({ fetchImpl, now: () => 0 });
    await expect(auth.getToken(creds)).rejects.toBeInstanceOf(Code100AuthError);
  });

  it('invalidate fuerza re-login', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'tok-1' }))
      .mockResolvedValueOnce(jsonResponse({ token: 'tok-2' }));
    const auth = new Code100Auth({ fetchImpl, now: () => 0 });

    expect(await auth.getToken(creds)).toBe('tok-1');
    auth.invalidate(creds);
    expect(await auth.getToken(creds)).toBe('tok-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
