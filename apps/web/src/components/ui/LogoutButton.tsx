'use client';

import { LogOut } from 'lucide-react';

import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Botón compacto para cerrar sesión.
 * Usado en mini-headers de POS, KDS, Entregas (que no muestran el sidebar admin).
 */
export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const clear = useAuthStore((s) => s.clear);

  async function logout() {
    await api('/auth/logout', { method: 'POST', skipAuth: true }).catch(() => {});
    clear();
    window.location.href = '/login';
  }

  return (
    <button
      type="button"
      onClick={logout}
      className="flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Cerrar sesión"
    >
      <LogOut className="h-3.5 w-3.5" />
      {!compact && <span>Salir</span>}
    </button>
  );
}
