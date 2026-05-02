'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { useAuthStore } from '@/lib/auth-store';

/** Roles que pueden entrar al panel admin (sidebar + dashboard). */
const ROLES_ADMIN = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN'];

export function AuthGate({
  children,
  roles = ROLES_ADMIN,
}: {
  children: ReactNode;
  /** Lista de roles permitidos. Default = roles admin. Páginas operativas (POS, KDS, Caja)
   *  deben pasar explícitamente los roles operativos que quieran admitir. */
  roles?: readonly string[];
}) {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const bootstrapping = useAuthStore((s) => s.bootstrapping);

  useEffect(() => {
    if (bootstrapping) return;
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    if (user && !roles.includes(user.rol)) {
      router.replace('/login?error=role');
    }
  }, [bootstrapping, accessToken, user, roles, router]);

  if (bootstrapping || !accessToken || (user && !roles.includes(user.rol))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm">
            {bootstrapping ? 'Cargando sesión...' : 'Verificando acceso...'}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** Roles permitidos en pantallas operativas (POS, Caja). */
export const ROLES_OPERATIVOS = [
  'CAJERO',
  'MESERO',
  'GERENTE_SUCURSAL',
  'ADMIN_EMPRESA',
  'SUPER_ADMIN',
] as const;

/** Roles permitidos en KDS (cocina). */
export const ROLES_KITCHEN = [
  'COCINA',
  'CAJERO',
  'MESERO',
  'GERENTE_SUCURSAL',
  'ADMIN_EMPRESA',
  'SUPER_ADMIN',
] as const;
