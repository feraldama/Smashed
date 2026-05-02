'use client';

import { Loader2, Save, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import { type Sucursal, useActualizarSucursal, useCrearSucursal } from '@/hooks/useSucursales';
import { ApiError } from '@/lib/api';

interface Props {
  sucursal?: Sucursal;
  onClose: () => void;
}

export function SucursalFormModal({ sucursal, onClose }: Props) {
  const isEdit = Boolean(sucursal);
  const crear = useCrearSucursal();
  const actualizar = useActualizarSucursal();
  const isPending = crear.isPending || actualizar.isPending;

  const [nombre, setNombre] = useState(sucursal?.nombre ?? '');
  const [codigo, setCodigo] = useState(sucursal?.codigo ?? '');
  const [establecimiento, setEstablecimiento] = useState(sucursal?.establecimiento ?? '');
  const [direccion, setDireccion] = useState(sucursal?.direccion ?? '');
  const [ciudad, setCiudad] = useState(sucursal?.ciudad ?? '');
  const [departamento, setDepartamento] = useState(sucursal?.departamento ?? '');
  const [telefono, setTelefono] = useState(sucursal?.telefono ?? '');
  const [email, setEmail] = useState(sucursal?.email ?? '');
  const [zonaHoraria, setZonaHoraria] = useState(sucursal?.zonaHoraria ?? 'America/Asuncion');
  const [activa, setActiva] = useState(sucursal?.activa ?? true);

  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError('Nombre requerido');
    if (!codigo.trim()) return setError('Código requerido');
    if (!/^\d{3}$/.test(establecimiento)) {
      return setError('Establecimiento debe ser exactamente 3 dígitos');
    }
    if (direccion.trim().length < 3) return setError('Dirección requerida');

    try {
      if (sucursal) {
        await actualizar.mutateAsync({
          id: sucursal.id,
          nombre: nombre.trim(),
          codigo: codigo.trim().toUpperCase(),
          establecimiento,
          direccion: direccion.trim(),
          ciudad: ciudad.trim() || null,
          departamento: departamento.trim() || null,
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          zonaHoraria: zonaHoraria.trim(),
          activa,
        });
        toast.success('Sucursal actualizada');
      } else {
        await crear.mutateAsync({
          nombre: nombre.trim(),
          codigo: codigo.trim().toUpperCase(),
          establecimiento,
          direccion: direccion.trim(),
          ciudad: ciudad.trim() || undefined,
          departamento: departamento.trim() || undefined,
          telefono: telefono.trim() || undefined,
          email: email.trim() || undefined,
          zonaHoraria: zonaHoraria.trim() || undefined,
        });
        toast.success('Sucursal creada');
      }
      onClose();
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      let msg = apiErr?.message ?? 'Error al guardar';
      const fields =
        apiErr?.details && typeof apiErr.details === 'object'
          ? (apiErr.details as { fieldErrors?: Record<string, string[]> }).fieldErrors
          : undefined;
      if (fields) {
        const k = Object.keys(fields)[0];
        if (k && fields[k]?.[0]) msg = `${k}: ${fields[k][0]}`;
      }
      setError(msg);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">{isEdit ? 'Editar sucursal' : 'Nueva sucursal'}</h2>
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
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_140px_120px]">
              <Field label="Nombre" required>
                <Input
                  autoFocus
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Asunción Centro"
                />
              </Field>
              <Field label="Código interno" required hint="ej: CEN, SLO">
                <Input
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  className="font-mono"
                  placeholder="CEN"
                  maxLength={20}
                />
              </Field>
              <Field label="Establecimiento" required hint="3 dígitos SIFEN">
                <Input
                  value={establecimiento}
                  onChange={(e) =>
                    setEstablecimiento(e.target.value.replace(/\D/g, '').slice(0, 3))
                  }
                  className="text-center font-mono"
                  placeholder="001"
                  maxLength={3}
                />
              </Field>
            </div>

            <Field label="Dirección" required>
              <Input
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Av. Mariscal López 1234"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ciudad">
                <Input
                  value={ciudad}
                  onChange={(e) => setCiudad(e.target.value)}
                  placeholder="Asunción"
                />
              </Field>
              <Field label="Departamento">
                <Input
                  value={departamento}
                  onChange={(e) => setDepartamento(e.target.value)}
                  placeholder="Central"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Teléfono">
                <Input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+595 21 ..."
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="centro@empresa.com.py"
                />
              </Field>
            </div>

            <Field label="Zona horaria" hint="ej: America/Asuncion (default)">
              <Input value={zonaHoraria} onChange={(e) => setZonaHoraria(e.target.value)} />
            </Field>

            {isEdit && (
              <SwitchField
                label="Sucursal activa"
                description="Si está desactivada, no se pueden crear pedidos ni emitir comprobantes"
                checked={activa}
                onCheckedChange={setActiva}
              />
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
              disabled={isPending}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
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
