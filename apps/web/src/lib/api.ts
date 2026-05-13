import { useAuthStore } from './auth-store';

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
  skipAuth?: boolean;
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
    const errPayload =
      json && typeof json === 'object' && 'error' in json
        ? (json as { error: ApiErrorPayload }).error
        : { code: 'UNKNOWN', message: res.statusText };

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

export async function tryRefresh(): Promise<boolean> {
  try {
    // Mandamos la sucursalActivaId actual como hint para que el server la preserve
    // si el usuario sigue teniendo acceso. Si no, cae al default (esPrincipal).
    const state = useAuthStore.getState();
    const sucursalActivaId = state.user?.sucursalActivaId ?? undefined;
    // Si el SUPER_ADMIN está operando como una empresa, mandamos el hint para
    // que el server preserve el modo (si la empresa sigue activa).
    const empresaIdOperar = state.empresaOperando?.id ?? undefined;
    const body: Record<string, string> = {};
    if (sucursalActivaId) body.sucursalActivaId = sucursalActivaId;
    if (empresaIdOperar) body.empresaIdOperar = empresaIdOperar;
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      accessToken: string;
      sucursalActivaId?: string | null;
      empresaId?: string | null;
    };
    useAuthStore.getState().setAccessToken(data.accessToken);
    if (data.sucursalActivaId !== undefined) {
      useAuthStore.getState().setSucursalActiva(data.sucursalActivaId);
    }
    // Si pedimos preservar el modo operar pero el server no lo confirmó (la
    // empresa pudo haber sido suspendida), limpiamos el estado para que el
    // banner desaparezca y la app refleje la realidad.
    if (empresaIdOperar && data.empresaId !== empresaIdOperar) {
      useAuthStore.getState().setEmpresaOperando(null);
    }
    return true;
  } catch {
    return false;
  }
}

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
        empresa: { id: string; nombreFantasia: string } | null;
        sucursales: {
          id: string;
          nombre: string;
          codigo: string;
          establecimiento: string;
          esPrincipal: boolean;
        }[];
        menusPermitidos: string[];
      };
      sucursalActivaId: string | null;
    }>('/auth/me');
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      store.clear();
      return;
    }
    store.setAuth(token, {
      ...meResp.user,
      empresaId: meResp.user.empresa?.id ?? null,
      empresaNombre: meResp.user.empresa?.nombreFantasia ?? null,
      sucursalActivaId: meResp.sucursalActivaId,
    });
  } catch {
    store.clear();
  }
}
