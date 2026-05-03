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
  /**
   * Lista de paths que el rol del usuario puede ver. La calcula el backend
   * a partir de la matriz `MenuRol` de la empresa. SUPER_ADMIN recibe todos.
   * Vacío = sin acceso a ningún menú admin.
   */
  menusPermitidos: string[];
}

interface AuthState {
  accessToken: string | null;
  user: SesionUsuario | null;
  bootstrapping: boolean;
  setAuth: (accessToken: string, user: SesionUsuario) => void;
  setAccessToken: (accessToken: string) => void;
  setSucursalActiva: (sucursalId: string | null) => void;
  setBootstrapping: (b: boolean) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  bootstrapping: true,
  setAuth: (accessToken, user) => set({ accessToken, user, bootstrapping: false }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setSucursalActiva: (sucursalId) =>
    set((s) => (s.user ? { user: { ...s.user, sucursalActivaId: sucursalId } } : s)),
  setBootstrapping: (b) => set({ bootstrapping: b }),
  clear: () => set({ accessToken: null, user: null, bootstrapping: false }),
}));
