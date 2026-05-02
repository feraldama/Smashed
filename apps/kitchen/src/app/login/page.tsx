'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChefHat, Loader2, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
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

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!bootstrapping && accessToken) router.replace('/');
  }, [accessToken, bootstrapping, router]);

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
      setAuth(resp.accessToken, resp.user);
      router.replace('/');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error de conexión');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <ChefHat className="mx-auto mb-2 h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">
            Smash <span className="text-primary">KDS</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Kitchen Display System</p>
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
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow',
              'hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed',
            )}
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
            Cuentas de cocina (password <span className="font-mono">Smash123!</span>):
          </p>
          <ul className="mt-1 space-y-0.5 font-mono">
            <li>cocina1@smash.com.py — Centro</li>
            <li>cocina2@smash.com.py — San Lorenzo</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
