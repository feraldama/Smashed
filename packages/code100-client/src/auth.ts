/**
 * Autenticación contra el middleware CODE100 y cache de token por RUC.
 *
 * `POST {dominio}/api/autenticate` devuelve un JWT válido por 2 horas.
 * Como cada empresa autentica con su propio RUC (multi-tenant), el cache
 * se indexa por `ruc@dominio`. Renovamos con margen de seguridad antes de
 * que expire el token real.
 */

import type { Code100AuthResponse, Code100Credentials } from './types.js';

/** Margen de seguridad: renovar el token 10 min antes del vencimiento real (2h). */
const TOKEN_TTL_MS = (120 - 10) * 60 * 1000;

interface CachedToken {
  token: string;
  expiraEn: number; // epoch ms
}

export type FetchLike = typeof fetch;

export interface AuthOptions {
  fetchImpl?: FetchLike;
  /** Inyectable para tests — default Date.now. */
  now?: () => number;
  /** Timeout de la llamada de autenticación en ms (default 15s). */
  timeoutMs?: number;
}

export class Code100AuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'Code100AuthError';
  }
}

/**
 * Gestiona la obtención y cacheo de tokens por credencial.
 * Una instancia puede servir a múltiples empresas/RUCs.
 */
export class Code100Auth {
  private readonly cache = new Map<string, CachedToken>();
  private readonly fetchImpl: FetchLike;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  /** Promesas en vuelo por clave, para coalescer logins concurrentes. */
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(opts: AuthOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  private static key(creds: Code100Credentials): string {
    return `${creds.ruc}@${creds.dominio}`;
  }

  /** Devuelve un token válido, reutilizando el cache cuando es posible. */
  async getToken(creds: Code100Credentials): Promise<string> {
    const key = Code100Auth.key(creds);
    const cached = this.cache.get(key);
    if (cached && cached.expiraEn > this.now()) return cached.token;

    const enVuelo = this.inflight.get(key);
    if (enVuelo) return enVuelo;

    const promesa = this.login(creds)
      .then((token) => {
        this.cache.set(key, { token, expiraEn: this.now() + TOKEN_TTL_MS });
        return token;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promesa);
    return promesa;
  }

  /** Invalida el token cacheado (p.ej. tras un 401 inesperado). */
  invalidate(creds: Code100Credentials): void {
    this.cache.delete(Code100Auth.key(creds));
  }

  private async login(creds: Code100Credentials): Promise<string> {
    const url = `${creds.dominio.replace(/\/$/, '')}/api/autenticate`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruc: creds.ruc, password: creds.password }),
        signal: ctrl.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Code100AuthError(`Error de transporte al autenticar: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    let body: Code100AuthResponse;
    try {
      body = (await res.json()) as Code100AuthResponse;
    } catch {
      throw new Code100AuthError(
        `Respuesta de autenticación no es JSON (HTTP ${res.status})`,
        res.status,
      );
    }

    if (!res.ok || !body.token) {
      throw new Code100AuthError(
        body.error ?? `Credenciales inválidas (HTTP ${res.status})`,
        res.status,
      );
    }
    return body.token;
  }
}
