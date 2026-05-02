'use client';

import { Key, Loader2, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input } from '@/components/ui/Input';
import { useResetPassword, type Usuario } from '@/hooks/useUsuarios';
import { ApiError } from '@/lib/api';

interface Props {
  usuario: Usuario;
  onClose: () => void;
}

export function ResetPasswordModal({ usuario, onClose }: Props) {
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reset = useResetPassword();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      return setError('Mínimo 8 caracteres con mayúscula, minúscula y número');
    }
    if (password !== confirmacion) {
      return setError('Las passwords no coinciden');
    }
    try {
      await reset.mutateAsync({ id: usuario.id, password });
      toast.success(`Password de ${usuario.nombreCompleto} reseteada`);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al resetear');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Key className="h-4 w-4" /> Resetear password
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4 p-5"
        >
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Atención:</strong> al resetear la password de{' '}
            <span className="font-mono">{usuario.email}</span>, se cierran todas sus sesiones
            activas y deberá volver a loguearse.
          </div>

          <Field
            label="Nueva password"
            required
            hint="Mínimo 8 caracteres · al menos 1 mayúscula, 1 minúscula y 1 número"
          >
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="font-mono"
              autoFocus
              placeholder="••••••••"
            />
          </Field>

          <Field label="Confirmá la password" required>
            <Input
              type="password"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              className="font-mono"
              placeholder="••••••••"
            />
          </Field>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={reset.isPending}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={reset.isPending}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {reset.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Resetear
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
