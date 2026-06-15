/**
 * Cliente HTTP del middleware FUTURA100 de CODE100.
 *
 * Transporte puro: no conoce Prisma ni el dominio de Smash. Recibe payloads
 * tipados y devuelve respuestas tipadas. El mapeo `Comprobante → payload`
 * vive en la API (`code100.mapper.ts`).
 *
 * Todas las operaciones de negocio pegan a `POST {dominio}/api/operation`
 * con el campo `tipOpe` indicando la operación. La autenticación es Bearer
 * con el token cacheado por RUC (ver `Code100Auth`).
 */

import { Code100Auth, type AuthOptions, type FetchLike } from './auth.js';
import {
  type Code100AltaPayload,
  type Code100AltaResponse,
  type Code100CancelacionPayload,
  type Code100ConsultaPayload,
  type Code100ConsultaResponse,
  type Code100Credentials,
  type Code100InutilizacionPayload,
  type Code100KudePayload,
  type Code100KudeResponse,
  type Code100XmlResponse,
  TipoOperacionApi,
} from './types.js';

export interface Code100ClientOptions extends AuthOptions {
  fetchImpl?: FetchLike;
  /** Timeout de las operaciones en ms (default 30s). */
  timeoutMs?: number;
  /** Instancia de auth compartida — si no se provee, se crea una interna. */
  auth?: Code100Auth;
}

export class Code100RequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'Code100RequestError';
  }
}

export class Code100Client {
  private readonly auth: Code100Auth;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(opts: Code100ClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.auth = opts.auth ?? new Code100Auth(opts);
  }

  /** tipOpe=1 — Alta de documento electrónico (asíncrono: no devuelve CDC). */
  async altaDocumento(
    creds: Code100Credentials,
    payload: Code100AltaPayload,
  ): Promise<Code100AltaResponse> {
    return this.operation<Code100AltaResponse>(creds, {
      ...payload,
      tipOpe: TipoOperacionApi.ALTA,
    });
  }

  /** tipOpe=2 — Consulta de estado del documento (trae CDC, QR, estado SIFEN). */
  async consultarEstado(
    creds: Code100Credentials,
    payload: Code100ConsultaPayload,
  ): Promise<Code100ConsultaResponse> {
    return this.operation<Code100ConsultaResponse>(creds, {
      tipOpe: TipoOperacionApi.CONSULTA_ESTADO,
      ...payload,
    });
  }

  /** tipOpe=3 — Obtener el XML firmado (base64). */
  async obtenerXml(
    creds: Code100Credentials,
    payload: Code100ConsultaPayload,
  ): Promise<Code100XmlResponse> {
    return this.operation<Code100XmlResponse>(creds, {
      tipOpe: TipoOperacionApi.OBTENER_XML,
      ...payload,
    });
  }

  /** tipOpe=4 — Obtener el KUDE (representación gráfica PDF en base64). */
  async obtenerKude(
    creds: Code100Credentials,
    payload: Code100KudePayload,
  ): Promise<Code100KudeResponse> {
    const { ticket, ...resto } = payload;
    return this.operation<Code100KudeResponse>(creds, {
      tipOpe: TipoOperacionApi.OBTENER_KUDE,
      ...resto,
      ticket: ticket ?? false,
    });
  }

  /** tipOpe=5 — Evento de cancelación. */
  async cancelar(
    creds: Code100Credentials,
    payload: Code100CancelacionPayload,
  ): Promise<Code100AltaResponse> {
    return this.operation<Code100AltaResponse>(creds, {
      tipOpe: TipoOperacionApi.EVENTO_CANCELACION,
      ...payload,
    });
  }

  /** tipOpe=6 — Evento de inutilización (rango de numeración). */
  async inutilizar(
    creds: Code100Credentials,
    payload: Code100InutilizacionPayload,
  ): Promise<Code100AltaResponse> {
    return this.operation<Code100AltaResponse>(creds, {
      tipOpe: TipoOperacionApi.EVENTO_INUTILIZACION,
      ...payload,
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  HTTP interno
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Ejecuta una operación contra `/api/operation`. Reintenta una vez si el
   * token cacheado fue rechazado (401), invalidándolo y re-autenticando.
   */
  private async operation<T>(
    creds: Code100Credentials,
    payload: Record<string, unknown>,
  ): Promise<T> {
    try {
      return await this.doRequest<T>(creds, payload);
    } catch (err) {
      if (err instanceof Code100RequestError && err.status === 401) {
        this.auth.invalidate(creds);
        return this.doRequest<T>(creds, payload);
      }
      throw err;
    }
  }

  private async doRequest<T>(
    creds: Code100Credentials,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const token = await this.auth.getToken(creds);
    const url = `${creds.dominio.replace(/\/$/, '')}/api/operation`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Code100RequestError(`Error de transporte: ${msg}`);
    } finally {
      clearTimeout(timer);
    }

    let body: unknown;
    const text = await res.text();
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Code100RequestError(`Respuesta no es JSON (HTTP ${res.status})`, res.status, text);
    }

    if (res.status === 401) {
      throw new Code100RequestError('Token rechazado', 401, body);
    }
    if (!res.ok) {
      throw new Code100RequestError(`HTTP ${res.status}`, res.status, body);
    }
    return body as T;
  }
}
