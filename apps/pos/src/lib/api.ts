import { useAuthStore } from './auth-store';

/**
 * Cliente HTTP para el API.
 *
 * - Base path `/api` → resuelve via Next rewrite al backend (mismo origen para el browser).
 * - Inyecta `Authorization: Bearer <accessToken>` desde el auth store.
 * - Si recibe 401 con `code: TOKEN_EXPIRED`, intenta refresh y reintenta UNA vez.
 * - Si el refresh falla, limpia el store; el AuthGate va a redirigir a /login.
 */

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
    this.details = payload.details;
  }
}

const BASE = '/api';

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Si true, no inyecta Authorization (para login/refresh). */
  skipAuth?: boolean;
  /** Internal — para evitar loop infinito de refresh. */
  _retry?: boolean;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, skipAuth, _retry, headers, ...rest } = opts;
  const accessToken = useAuthStore.getState().accessToken;

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...((headers as Record<string, string>) ?? {}),
  };
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (!skipAuth && accessToken) finalHeaders.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const errPayload = (
      json && typeof json === 'object' && 'error' in json
        ? (json as { error: ApiErrorPayload }).error
        : { code: 'UNKNOWN', message: res.statusText }
    );

    // Token expirado → intentar refresh + reintento (una sola vez).
    if (res.status === 401 && errPayload.code === 'TOKEN_EXPIRED' && !_retry && !skipAuth) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return api<T>(path, { ...opts, _retry: true });
      }
      useAuthStore.getState().clear();
    }

    throw new ApiError(res.status, errPayload);
  }

  return json as T;
}

/**
 * Intento silencioso de refresh — usado por:
 *  1. Bootstrap inicial al cargar la app
 *  2. Auto-retry cuando un request devuelve TOKEN_EXPIRED
 */
export async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    useAuthStore.getState().setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bootstrap: si no hay accessToken en memoria pero existe cookie de refresh válida,
 * recuperamos sesión llamando a /auth/refresh + /auth/me.
 */
export async function bootstrapAuth() {
  const store = useAuthStore.getState();
  if (store.accessToken) {
    store.setBootstrapping(false);
    return;
  }
  const refreshed = await tryRefresh();
  if (!refreshed) {
    store.clear();
    return;
  }
  try {
    const meResp = await api<{
      user: {
        id: string;
        email: string;
        nombreCompleto: string;
        rol: string;
        empresa: { id: string } | null;
        sucursales: {
          id: string;
          nombre: string;
          codigo: string;
          establecimiento: string;
          esPrincipal: boolean;
        }[];
      };
      sucursalActivaId: string | null;
    }>('/auth/me');
    store.setAuth(useAuthStore.getState().accessToken!, {
      ...meResp.user,
      empresaId: meResp.user.empresa?.id ?? null,
      sucursalActivaId: meResp.sucursalActivaId,
    });
  } catch {
    store.clear();
  }
}
