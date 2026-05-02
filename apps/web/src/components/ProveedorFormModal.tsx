'use client';

import { Loader2, Save, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { type Proveedor, useActualizarProveedor, useCrearProveedor } from '@/hooks/useProveedores';
import { ApiError } from '@/lib/api';

interface ProveedorFormModalProps {
  proveedor?: Proveedor;
  onClose: () => void;
}

export function ProveedorFormModal({ proveedor, onClose }: ProveedorFormModalProps) {
  const crear = useCrearProveedor();
  const actualizar = useActualizarProveedor();
  const isPending = crear.isPending || actualizar.isPending;

  const [razonSocial, setRazonSocial] = useState(proveedor?.razonSocial ?? '');
  const [ruc, setRuc] = useState(proveedor?.ruc ?? '');
  const [dv, setDv] = useState(proveedor?.dv ?? '');
  const [contacto, setContacto] = useState(proveedor?.contacto ?? '');
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? '');
  const [email, setEmail] = useState(proveedor?.email ?? '');
  const [direccion, setDireccion] = useState(proveedor?.direccion ?? '');
  const [notas, setNotas] = useState(proveedor?.notas ?? '');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!razonSocial.trim()) return setError('Razón social requerida');

    const body = {
      razonSocial: razonSocial.trim(),
      ruc: ruc.trim() || undefined,
      dv: dv.trim() || undefined,
      contacto: contacto.trim() || undefined,
      telefono: telefono.trim() || undefined,
      email: email.trim() || undefined,
      direccion: direccion.trim() || undefined,
      notas: notas.trim() || undefined,
    };

    try {
      if (proveedor) {
        await actualizar.mutateAsync({ id: proveedor.id, ...body });
        toast.success('Proveedor actualizado');
      } else {
        await crear.mutateAsync(body);
        toast.success('Proveedor creado');
      }
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
        className="w-full max-w-2xl overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">
            {proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}
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

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <Field label="Razón social" required>
            <Input
              autoFocus
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="DISTRIBUIDORA TAL S.A."
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-[1fr_80px]">
            <Field label="RUC">
              <Input
                value={ruc}
                onChange={(e) => setRuc(e.target.value.replace(/\D/g, ''))}
                className="font-mono"
                placeholder="80012345"
                maxLength={8}
              />
            </Field>
            <Field label="DV">
              <Input
                value={dv}
                onChange={(e) => setDv(e.target.value.replace(/\D/g, '').slice(0, 1))}
                className="text-center font-mono"
                placeholder="0"
                maxLength={1}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Contacto">
              <Input
                value={contacto}
                onChange={(e) => setContacto(e.target.value)}
                placeholder="Lic. Mario Duarte"
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+595 21 ..."
              />
            </Field>
          </div>

          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ventas@proveedor.com.py"
            />
          </Field>

          <Field label="Dirección">
            <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </Field>

          <Field label="Notas">
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Días de entrega, condiciones especiales..."
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
              className="rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
