import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  /**
   * Lista de paths que el rol del usuario puede ver. La calcula el backend
   * a partir de la matriz `MenuRol` de la empresa. SUPER_ADMIN recibe todos.
   * Vacío = sin acceso a ningún menú admin.
   */
  menusPermitidos: string[];
}

/**
 * Cuando un SUPER_ADMIN está operando como una empresa específica
 * (modo "impersonate"), guardamos el contexto acá para mostrar el banner
 * en el shell y mandar el hint al `/auth/refresh` para que el modo
 * sobreviva al expire del access token (15 min).
 */
export interface EmpresaOperando {
  id: string;
  nombreFantasia: string;
  razonSocial: string;
}

interface AuthState {
  accessToken: string | null;
  user: SesionUsuario | null;
  bootstrapping: boolean;
  empresaOperando: EmpresaOperando | null;
  setAuth: (accessToken: string, user: SesionUsuario) => void;
  setAccessToken: (accessToken: string) => void;
  setSucursalActiva: (sucursalId: string | null) => void;
  setBootstrapping: (b: boolean) => void;
  setEmpresaOperando: (e: EmpresaOperando | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      bootstrapping: true,
      empresaOperando: null,
      setAuth: (accessToken, user) => set({ accessToken, user, bootstrapping: false }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setSucursalActiva: (sucursalId) =>
        set((s) => (s.user ? { user: { ...s.user, sucursalActivaId: sucursalId } } : s)),
      setBootstrapping: (b) => set({ bootstrapping: b }),
      setEmpresaOperando: (e) => set({ empresaOperando: e }),
      clear: () =>
        set({ accessToken: null, user: null, bootstrapping: false, empresaOperando: null }),
    }),
    {
      name: 'smash-auth',
      // Sólo persistimos el estado del modo "operar como" — el resto se
      // rehidrata desde el refresh token (cookie httpOnly) en bootstrapAuth.
      partialize: (s) => ({ empresaOperando: s.empresaOperando }),
    },
  ),
);
