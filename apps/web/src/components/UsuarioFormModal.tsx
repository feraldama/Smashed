'use client';

import { Loader2, Save, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input, Select } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import {
  ROLES_DISPONIBLES,
  type Rol,
  type SucursalAsignacionInput,
  type Usuario,
  useActualizarUsuario,
  useCrearUsuario,
} from '@/hooks/useUsuarios';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

interface Props {
  usuario?: Usuario;
  onClose: () => void;
}

export function UsuarioFormModal({ usuario, onClose }: Props) {
  const me = useAuthStore((s) => s.user);
  const isEdit = Boolean(usuario);
  const sucursalesDisponibles = me?.sucursales ?? [];

  const crear = useCrearUsuario();
  const actualizar = useActualizarUsuario();
  const isPending = crear.isPending || actualizar.isPending;

  const [email, setEmail] = useState(usuario?.email ?? '');
  const [nombreCompleto, setNombreCompleto] = useState(usuario?.nombreCompleto ?? '');
  const [documento, setDocumento] = useState(usuario?.documento ?? '');
  const [telefono, setTelefono] = useState(usuario?.telefono ?? '');
  const [rol, setRol] = useState<Rol>((usuario?.rol as Rol) ?? 'CAJERO');
  const [activo, setActivo] = useState(usuario?.activo ?? true);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // sucursales seleccionadas: Map<sucursalId, esPrincipal>
  const [sucursalesSel, setSucursalesSel] = useState<Map<string, boolean>>(() => {
    const m = new Map<string, boolean>();
    usuario?.sucursales.forEach((s) => m.set(s.sucursalId, s.esPrincipal));
    return m;
  });

  const [error, setError] = useState<string | null>(null);

  function toggleSucursal(sucursalId: string) {
    setSucursalesSel((prev) => {
      const m = new Map(prev);
      if (m.has(sucursalId)) m.delete(sucursalId);
      else m.set(sucursalId, false);
      // si quedó solo una, marcarla como principal automáticamente
      if (m.size === 1) {
        const only = m.keys().next().value;
        if (only) m.set(only, true);
      }
      return m;
    });
  }

  function setPrincipal(sucursalId: string) {
    setSucursalesSel((prev) => {
      const m = new Map(prev);
      m.forEach((_, k) => m.set(k, false));
      m.set(sucursalId, true);
      return m;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) return setError('Email requerido');
    if (!nombreCompleto.trim()) return setError('Nombre requerido');
    if (!isEdit && password.length < 8) {
      return setError('Password mínimo 8 caracteres con mayúscula, minúscula y número');
    }

    const sucursales: SucursalAsignacionInput[] = Array.from(sucursalesSel.entries()).map(
      ([sucursalId, esPrincipal]) => ({ sucursalId, esPrincipal }),
    );

    // Roles que requieren al menos una sucursal asignada
    const rolesQueRequierenSucursal: Rol[] = [
      'CAJERO',
      'COCINA',
      'MESERO',
      'REPARTIDOR',
      'GERENTE_SUCURSAL',
    ];
    if (rolesQueRequierenSucursal.includes(rol) && sucursales.length === 0) {
      return setError(`El rol ${rol} requiere al menos una sucursal asignada`);
    }

    try {
      if (usuario) {
        await actualizar.mutateAsync({
          id: usuario.id,
          email: email.trim(),
          nombreCompleto: nombreCompleto.trim(),
          documento: documento.trim() || null,
          telefono: telefono.trim() || null,
          rol,
          activo,
          sucursales,
        });
        toast.success('Usuario actualizado');
      } else {
        await crear.mutateAsync({
          email: email.trim(),
          password,
          nombreCompleto: nombreCompleto.trim(),
          documento: documento.trim() || undefined,
          telefono: telefono.trim() || undefined,
          rol,
          sucursales,
        });
        toast.success('Usuario creado');
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
          <h2 className="text-lg font-semibold">{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h2>
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
          id="usuario-form"
        >
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre completo" required>
                <Input
                  autoFocus
                  value={nombreCompleto}
                  onChange={(e) => setNombreCompleto(e.target.value)}
                  placeholder="Juan Pérez"
                />
              </Field>
              <Field label="Email" required>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com.py"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Documento (CI / RUC)">
                <Input
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  className="font-mono"
                  placeholder="1234567"
                />
              </Field>
              <Field label="Teléfono">
                <Input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+595 981 ..."
                />
              </Field>
            </div>

            {/* Password — solo en creación, edición tiene "Resetear password" aparte */}
            {!isEdit && (
              <Field
                label="Password"
                required
                hint="Mínimo 8 caracteres · al menos 1 mayúscula, 1 minúscula y 1 número"
              >
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-20 font-mono"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                  >
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </Field>
            )}

            {/* Rol */}
            <Field label="Rol" required>
              <Select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
                {ROLES_DISPONIBLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.description}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Activo (solo en edición) */}
            {isEdit && (
              <SwitchField
                label="Usuario activo"
                description="Si está desactivado, el usuario no puede loguearse"
                checked={activo}
                onCheckedChange={setActivo}
              />
            )}

            {/* Sucursales */}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Sucursales asignadas
              </label>
              {sucursalesDisponibles.length === 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  No tenés sucursales accesibles para asignar.
                </div>
              ) : (
                <div className="space-y-1.5 rounded-md border p-2">
                  {sucursalesDisponibles.map((s) => {
                    const seleccionada = sucursalesSel.has(s.id);
                    const esPrincipal = sucursalesSel.get(s.id) === true;
                    return (
                      <div
                        key={s.id}
                        className={cn(
                          'flex items-center gap-2 rounded-md border p-2',
                          seleccionada ? 'border-primary/50 bg-primary/5' : 'border-input',
                        )}
                      >
                        <input
                          type="checkbox"
                          id={`suc-${s.id}`}
                          checked={seleccionada}
                          onChange={() => toggleSucursal(s.id)}
                          className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <label htmlFor={`suc-${s.id}`} className="flex-1 cursor-pointer text-sm">
                          <span className="font-medium">{s.nombre}</span>
                          <span className="ml-1 text-xs text-muted-foreground">({s.codigo})</span>
                        </label>
                        {seleccionada && (
                          <button
                            type="button"
                            onClick={() => setPrincipal(s.id)}
                            disabled={esPrincipal}
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors',
                              esPrincipal
                                ? 'bg-primary text-primary-foreground'
                                : 'border border-input text-muted-foreground hover:bg-accent',
                            )}
                          >
                            {esPrincipal ? '★ Principal' : 'Marcar principal'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                Marcá la sucursal principal — es la que abre por default cuando el usuario se
                loguea.
              </p>
            </div>

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
