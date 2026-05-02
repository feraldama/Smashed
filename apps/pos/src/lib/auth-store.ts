import { create } from 'zustand';

export interface SesionUsuario {
  id: string;
  email: string;
  nombreCompleto: string;
  rol: string;
  empresaId: string | null;
  sucursales: {
    id: string;
    nombre: string;
    codigo: string;
    establecimiento: string;
    esPrincipal: boolean;
  }[];
  sucursalActivaId: string | null;
}

interface AuthState {
  accessToken: string | null;
  user: SesionUsuario | null;
  /** true mientras corre el bootstrap inicial (intento de refresh silencioso). */
  bootstrapping: boolean;

  setAuth: (accessToken: string, user: SesionUsuario) => void;
  setAccessToken: (accessToken: string) => void;
  setSucursalActiva: (sucursalActivaId: string, accessToken: string) => void;
  setBootstrapping: (b: boolean) => void;
  clear: () => void;
}

/**
 * Store en memoria — el access token nunca toca localStorage (XSS).
 * El refresh persiste en cookie httpOnly del API; al refresh de página
 * el bootstrap intenta /auth/refresh para recuperar la sesión.
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  bootstrapping: true,

  setAuth: (accessToken, user) => set({ accessToken, user, bootstrapping: false }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setSucursalActiva: (sucursalActivaId, accessToken) =>
    set((state) =>
      state.user ? { accessToken, user: { ...state.user, sucursalActivaId } } : { accessToken },
    ),
  setBootstrapping: (b) => set({ bootstrapping: b }),
  clear: () => set({ accessToken: null, user: null, bootstrapping: false }),
}));
