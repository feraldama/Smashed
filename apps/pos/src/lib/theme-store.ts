import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

/**
 * Preferencia de tema (claro/oscuro) del POS. Se persiste en localStorage con
 * la clave `smash-theme`. El layout incluye un script inline que lee esta misma
 * clave antes del primer paint para evitar el flash de tema incorrecto (FOUC)
 * — si cambia el nombre de la clave, actualizar también ese script.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      setTheme: (theme) => set({ theme }),
      toggle: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    { name: 'smash-theme' },
  ),
);

/**
 * Sincroniza la clase `dark` del `<html>` con la preferencia guardada.
 * Montar una sola vez (en AppProviders).
 */
export function useApplyTheme() {
  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
}
