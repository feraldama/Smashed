'use client';

import { ArrowLeft, Home, LogOut, ShieldAlert } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { puedeAcceder } from '@/lib/permissions';

/** Mapeo rol → ruta home natural (la pantalla principal de cada rol). */
const ROL_HOME: Record<string, string> = {
  SUPER_ADMIN: '/',
  ADMIN_EMPRESA: '/',
  GERENTE_SUCURSAL: '/',
  CAJERO: '/pos',
  MESERO: '/pos',
  COCINA: '/kds',
  REPARTIDOR: '/entregas',
};

export function AuthGate({
  children,
  roles,
}: {
  children: ReactNode;
  /**
   * Lista explícita de roles permitidos. Si se pasa, se ignora la matriz
   * dinámica de `menusPermitidos`. Útil sólo para casos especiales — el
   * patrón normal es omitir y dejar que el gate consulte el store.
   */
  roles?: readonly string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const bootstrapping = useAuthStore((s) => s.bootstrapping);

  // Sólo redirigimos si no hay sesión. Si hay sesión pero el rol no tiene permiso,
  // mostramos una pantalla "Sin permisos" en lugar de redirigir al login.
  useEffect(() => {
    if (bootstrapping) return;
    if (!accessToken) {
      router.replace('/login');
    }
  }, [bootstrapping, accessToken, router]);

  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  if (!accessToken) {
    // Mientras corre el router.replace, mostramos un spinner para no parpadear.
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Modo "lista de roles explícita": back-compat para callers viejos.
  if (roles && user && !roles.includes(user.rol)) {
    return <ForbiddenScreen motivo={`Rol permitido: ${roles.join(' · ')}`} />;
  }

  // Modo normal: consultar `menusPermitidos` del store contra el pathname.
  if (!roles && user && !puedeAcceder(user.menusPermitidos, pathname)) {
    return <ForbiddenScreen motivo="Tu rol no tiene este menú habilitado." />;
  }

  return <>{children}</>;
}

function ForbiddenScreen({ motivo }: { motivo: string }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  const homePath = (user && ROL_HOME[user.rol]) ?? '/';

  async function logout() {
    await api('/auth/logout', { method: 'POST', skipAuth: true }).catch(() => {});
    clear();
    window.location.href = '/login';
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted px-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-lg">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Sin permisos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu rol no tiene acceso a esta pantalla.
          </p>
        </div>

        {user && (
          <div className="mb-5 rounded-md border bg-muted/40 p-3 text-xs">
            <p>
              Sesión: <strong>{user.nombreCompleto}</strong>
            </p>
            <p className="text-muted-foreground">
              Rol actual: <span className="font-mono">{user.rol}</span>
            </p>
            <p className="mt-1 text-muted-foreground">{motivo}</p>
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => router.replace(homePath)}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Home className="h-4 w-4" /> Ir a mi inicio
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-accent"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Volver
            </button>
            <button
              type="button"
              onClick={() => {
                void logout();
              }}
              className="flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-3.5 w-3.5" /> Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

// Re-exporto las constantes para retro-compatibilidad con páginas que las
// importaban desde aquí. La fuente real está en `lib/permissions.ts`.
export {
  ROLES_ADMIN,
  ROLES_ENTREGAS,
  ROLES_GESTION,
  ROLES_KITCHEN,
  ROLES_OPERATIVOS,
} from '@/lib/permissions';
