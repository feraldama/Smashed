'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, LogIn, Settings } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiError, api } from '@/lib/api';
import { type SesionUsuario, useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

type LoginInput = z.infer<typeof loginSchema>;

interface LoginResponse {
  accessToken: string;
  user: Omit<SesionUsuario, 'sucursalActivaId'> & { sucursalActivaId: string | null };
}

const ROLES_PERMITIDOS = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN'];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('error') === 'role') {
      setServerError('Tu rol no tiene acceso al panel administrativo.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!bootstrapping && accessToken && user && ROLES_PERMITIDOS.includes(user.rol)) {
      router.replace('/');
    }
  }, [accessToken, bootstrapping, user, router]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    try {
      const resp = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: data,
        skipAuth: true,
      });
      if (!ROLES_PERMITIDOS.includes(resp.user.rol)) {
        setServerError('Tu rol no tiene acceso al panel administrativo.');
        return;
      }
      setAuth(resp.accessToken, resp.user);
      router.replace('/');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error de conexión');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-lg">
        <div className="mb-6 text-center">
          <Settings className="mx-auto mb-2 h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">
            Smash <span className="text-primary">Admin</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Panel administrativo</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              {...register('email')}
              className={cn(
                'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                errors.email && 'border-destructive',
              )}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
              className={cn(
                'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                errors.password && 'border-destructive',
              )}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          {serverError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Ingresando...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" /> Ingresar
              </>
            )}
          </button>
        </form>

        <div className="mt-6 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <p className="font-semibold">
            Cuentas con acceso (password <span className="font-mono">Smash123!</span>):
          </p>
          <ul className="mt-1 space-y-0.5 font-mono">
            <li>admin@smash.com.py — ADMIN_EMPRESA</li>
            <li>gerente.centro@smash.com.py — GERENTE</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
