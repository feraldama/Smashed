'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Field, Input } from '@/components/ui/Input';
import { ApiError, api } from '@/lib/api';
import { type SesionUsuario, useAuthStore } from '@/lib/auth-store';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

type LoginInput = z.infer<typeof loginSchema>;

interface LoginResponse {
  accessToken: string;
  user: Omit<SesionUsuario, 'sucursalActivaId'> & { sucursalActivaId: string | null };
}

/**
 * Mapeo de rol → ruta inicial al loguearse.
 * - Admin/gerente: panel administrativo (/).
 * - Cajero/mesero: POS para vender directo.
 * - Cocina: KDS para ver pedidos.
 * - Repartidor: pantalla de entregas.
 */
const ROL_REDIRECT: Record<string, string> = {
  // SUPER_ADMIN entra al panel de gestión de empresas: desde acá administra
  // los tenants y, si quiere operar sobre uno, usa el botón "Operar".
  SUPER_ADMIN: '/admin/empresas',
  ADMIN_EMPRESA: '/',
  GERENTE_SUCURSAL: '/',
  CAJERO: '/pos',
  MESERO: '/pos',
  COCINA: '/kds',
  REPARTIDOR: '/entregas',
};

function rutaInicial(rol: string): string {
  return ROL_REDIRECT[rol] ?? '/';
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const bootstrapping = useAuthStore((s) => s.bootstrapping);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Mensaje desde otra página (ej: sesión expirada).
  useEffect(() => {
    const err = searchParams.get('error');
    if (err === 'session') {
      setServerError('Tu sesión expiró — volvé a entrar.');
    }
  }, [searchParams]);

  // Si ya hay sesión activa, redirigir según rol.
  useEffect(() => {
    if (!bootstrapping && accessToken && user) {
      router.replace(rutaInicial(user.rol));
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
      setAuth(resp.accessToken, resp.user);
      router.replace(rutaInicial(resp.user.rol));
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Error de conexión');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <span className="text-2xl font-bold">S</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Smash <span className="text-primary">POS</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Iniciá sesión con tu usuario</p>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="space-y-3"
          noValidate
        >
          <Field label="Email" required error={errors.email?.message}>
            <Input type="email" autoComplete="username" autoFocus {...register('email')} />
          </Field>

          <Field label="Contraseña" required error={errors.password?.message}>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-10"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          {serverError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
          <p className="mb-1 font-semibold">
            Cuentas de prueba <span className="font-mono">(password Smash123!)</span>:
          </p>
          <ul className="space-y-0.5 font-mono">
            <li>
              <span className="font-bold">admin@smash.com.py</span> · admin
            </li>
            <li>
              <span className="font-bold">gerente.centro@smash.com.py</span> · gerente
            </li>
            <li>
              <span className="font-bold">cajero1@smash.com.py</span> · cajero → POS
            </li>
            <li>
              <span className="font-bold">cocina1@smash.com.py</span> · cocina → KDS
            </li>
            <li>
              <span className="font-bold">mesero1@smash.com.py</span> · mesero → POS
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
