'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuthStore } from '@/lib/auth-store';

/**
 * Wrapper para páginas protegidas:
 *  - Mientras bootstrapping → spinner
 *  - Sin sesión → redirige a /login
 *  - Con sesión → renderiza children
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const bootstrapping = useAuthStore((s) => s.bootstrapping);

  useEffect(() => {
    if (!bootstrapping && !accessToken) {
      router.replace('/login');
    }
  }, [bootstrapping, accessToken, router]);

  if (bootstrapping || !accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm">{bootstrapping ? 'Cargando sesión...' : 'Redirigiendo...'}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
