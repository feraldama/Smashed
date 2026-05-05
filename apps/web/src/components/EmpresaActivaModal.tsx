'use client';

import { Loader2, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Textarea } from '@/components/ui/Input';
import { type AdminEmpresa, useCambiarActivaEmpresa } from '@/hooks/useAdminEmpresas';
import { ApiError } from '@/lib/api';

interface Props {
  empresa: AdminEmpresa;
  onClose: () => void;
}

export function EmpresaActivaModal({ empresa, onClose }: Props) {
  // Si está activa, vamos a desactivarla; si está inactiva, vamos a reactivarla.
  const accion: 'desactivar' | 'reactivar' = empresa.activa ? 'desactivar' : 'reactivar';
  const cambiar = useCambiarActivaEmpresa();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (accion === 'desactivar' && motivo.trim().length < 3) {
      return setError('El motivo es obligatorio (mín. 3 caracteres)');
    }

    try {
      await cambiar.mutateAsync({
        id: empresa.id,
        activa: accion === 'reactivar',
        motivo: accion === 'desactivar' ? motivo.trim() : undefined,
      });
      toast.success(accion === 'desactivar' ? 'Empresa suspendida' : 'Empresa reactivada');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">
            {accion === 'desactivar' ? 'Suspender empresa' : 'Reactivar empresa'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="flex flex-col"
        >
          <div className="space-y-4 p-5">
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <p className="font-semibold">{empresa.nombreFantasia}</p>
              <p className="text-xs text-muted-foreground">{empresa.razonSocial}</p>
              <p className="mt-1 font-mono text-xs">
                RUC: {empresa.ruc}-{empresa.dv}
              </p>
            </div>

            {accion === 'desactivar' ? (
              <>
                <p className="text-sm">
                  Al suspender la empresa, sus usuarios no van a poder loguearse y las sesiones
                  activas se van a cortar en menos de 15 minutos.
                </p>
                <Field label="Motivo" required hint="Lo guardamos para auditoría">
                  <Textarea
                    autoFocus
                    rows={3}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ej: falta de pago Mayo 2026"
                  />
                </Field>
              </>
            ) : (
              <>
                <p className="text-sm">
                  Al reactivar, los usuarios van a poder volver a hacer login. Se limpia el motivo y
                  la fecha de suspensión.
                </p>
                {empresa.motivoInactiva && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/30">
                    <p className="font-semibold text-amber-900 dark:text-amber-100">
                      Motivo de la suspensión
                    </p>
                    <p className="mt-0.5 text-amber-800 dark:text-amber-200">
                      {empresa.motivoInactiva}
                    </p>
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t bg-muted/20 px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={cambiar.isPending}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={cambiar.isPending}
              className={
                accion === 'desactivar'
                  ? 'flex items-center gap-1.5 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60'
                  : 'flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60'
              }
            >
              {cambiar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {accion === 'desactivar' ? 'Suspender' : 'Reactivar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
