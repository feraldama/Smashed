'use client';

import { calcularDvRuc } from '@smash/shared-utils';
import { Copy, Loader2, Save, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import { type CrearEmpresaResultado, useCrearAdminEmpresa } from '@/hooks/useAdminEmpresas';
import { ApiError } from '@/lib/api';

interface Props {
  onClose: () => void;
  onCreado?: (resultado: CrearEmpresaResultado) => void;
}

export function EmpresaAdminFormModal({ onClose, onCreado }: Props) {
  const crear = useCrearAdminEmpresa();
  const [resultado, setResultado] = useState<CrearEmpresaResultado | null>(null);

  // Datos empresa
  const [nombreFantasia, setNombreFantasia] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [ruc, setRuc] = useState('');
  // El DV se calcula automáticamente con el algoritmo módulo 11 (mismo que
  // valida el backend). Lo derivamos del RUC en cada render — no es state.
  const dv = ruc && /^\d+$/.test(ruc) ? String(calcularDvRuc(ruc)) : '';
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');

  // Admin inicial
  const [adminNombre, setAdminNombre] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Sucursal inicial (opcional, se activa con un switch)
  const [conSucursal, setConSucursal] = useState(true);
  const [sucNombre, setSucNombre] = useState('');
  const [sucCodigo, setSucCodigo] = useState('');
  const [sucEstablecimiento, setSucEstablecimiento] = useState('001');
  const [sucDireccion, setSucDireccion] = useState('');
  const [sucCiudad, setSucCiudad] = useState('');
  const [sucDepartamento, setSucDepartamento] = useState('');
  const [sucTelefono, setSucTelefono] = useState('');
  const [sucEmail, setSucEmail] = useState('');

  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (nombreFantasia.trim().length < 2) return setError('Nombre de fantasía requerido');
    if (razonSocial.trim().length < 2) return setError('Razón social requerida');
    if (!/^\d{6,8}$/.test(ruc)) return setError('RUC debe tener 6-8 dígitos');
    if (!/^\d$/.test(dv)) return setError('DV debe ser un dígito');
    if (adminNombre.trim().length < 2) return setError('Nombre del admin requerido');
    if (!adminEmail.trim()) return setError('Email del admin requerido');

    if (conSucursal) {
      if (sucNombre.trim().length < 2) return setError('Nombre de la sucursal requerido');
      if (sucCodigo.trim().length < 2) return setError('Código de sucursal requerido');
      if (!/^\d{3}$/.test(sucEstablecimiento)) {
        return setError('Establecimiento debe ser exactamente 3 dígitos');
      }
      if (sucDireccion.trim().length < 3) return setError('Dirección de la sucursal requerida');
    }

    try {
      const r = await crear.mutateAsync({
        nombreFantasia: nombreFantasia.trim(),
        razonSocial: razonSocial.trim(),
        ruc,
        dv,
        direccion: direccion.trim() || undefined,
        telefono: telefono.trim() || undefined,
        email: email.trim() || undefined,
        admin: {
          nombreCompleto: adminNombre.trim(),
          email: adminEmail.trim().toLowerCase(),
          password: adminPassword.trim() || undefined,
        },
        sucursalInicial: conSucursal
          ? {
              nombre: sucNombre.trim(),
              codigo: sucCodigo.trim().toUpperCase(),
              establecimiento: sucEstablecimiento,
              direccion: sucDireccion.trim(),
              ciudad: sucCiudad.trim() || undefined,
              departamento: sucDepartamento.trim() || undefined,
              telefono: sucTelefono.trim() || undefined,
              email: sucEmail.trim().toLowerCase() || undefined,
            }
          : undefined,
      });
      setResultado(r);
      onCreado?.(r);
      toast.success('Empresa creada');
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      let msg = apiErr?.message ?? 'Error al crear empresa';
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
          <h2 className="text-lg font-semibold">
            {resultado ? 'Empresa creada' : 'Nueva empresa'}
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

        {resultado ? (
          <ResultadoCreacion resultado={resultado} onCerrar={onClose} />
        ) : (
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Datos de la empresa
                </h3>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nombre de fantasía" required>
                      <Input
                        autoFocus
                        value={nombreFantasia}
                        onChange={(e) => setNombreFantasia(e.target.value)}
                        placeholder="Smash Burgers"
                      />
                    </Field>
                    <Field label="Razón social" required>
                      <Input
                        value={razonSocial}
                        onChange={(e) => setRazonSocial(e.target.value.toUpperCase())}
                        placeholder="SMASH BURGERS S.A."
                      />
                    </Field>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
                    <Field label="RUC" required hint="6-8 dígitos, sin DV">
                      <Input
                        value={ruc}
                        onChange={(e) => setRuc(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        className="font-mono"
                        placeholder="80012345"
                        maxLength={8}
                      />
                    </Field>
                    <Field label="DV" hint="Calculado automático">
                      <Input
                        value={dv}
                        readOnly
                        tabIndex={-1}
                        className="cursor-not-allowed bg-muted text-center font-mono"
                        placeholder="—"
                      />
                    </Field>
                  </div>
                  <Field label="Dirección">
                    <Input
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      placeholder="Av. España 1234, Asunción"
                    />
                  </Field>
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
                        placeholder="contacto@empresa.com.py"
                      />
                    </Field>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Administrador inicial
                </h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Se crea un usuario con rol ADMIN_EMPRESA. Va a poder cargar sucursales, usuarios y
                  demás configuración. Si dejás la contraseña vacía, generamos una aleatoria que vas
                  a ver una sola vez.
                </p>
                <div className="space-y-3">
                  <Field label="Nombre completo" required>
                    <Input
                      value={adminNombre}
                      onChange={(e) => setAdminNombre(e.target.value)}
                      placeholder="Pedro Pérez"
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Email" required>
                      <Input
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="admin@empresa.com.py"
                      />
                    </Field>
                    <Field label="Contraseña" hint="Vacío = se genera aleatoria">
                      <Input
                        type="text"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="(automática)"
                      />
                    </Field>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Primera sucursal
                </h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Si la creás ahora, le entregás al cliente el sistema listo para operar: sucursal
                  con su punto de expedición default, y el admin queda asociado como principal.
                  Después se pueden agregar más sucursales desde el panel.
                </p>
                <SwitchField
                  label="Crear primera sucursal ahora"
                  description="Recomendado — evita un paso manual del cliente"
                  checked={conSucursal}
                  onCheckedChange={setConSucursal}
                />
                {conSucursal && (
                  <div className="mt-3 space-y-3 rounded-md border bg-muted/20 p-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_140px_120px]">
                      <Field label="Nombre" required>
                        <Input
                          value={sucNombre}
                          onChange={(e) => setSucNombre(e.target.value)}
                          placeholder="Asunción Centro"
                        />
                      </Field>
                      <Field label="Código interno" required hint="ej: CEN, SLO">
                        <Input
                          value={sucCodigo}
                          onChange={(e) => setSucCodigo(e.target.value.toUpperCase())}
                          className="font-mono"
                          placeholder="CEN"
                          maxLength={20}
                        />
                      </Field>
                      <Field label="Establecimiento" required hint="3 dígitos SIFEN">
                        <Input
                          value={sucEstablecimiento}
                          onChange={(e) =>
                            setSucEstablecimiento(e.target.value.replace(/\D/g, '').slice(0, 3))
                          }
                          className="text-center font-mono"
                          placeholder="001"
                          maxLength={3}
                        />
                      </Field>
                    </div>
                    <Field label="Dirección" required>
                      <Input
                        value={sucDireccion}
                        onChange={(e) => setSucDireccion(e.target.value)}
                        placeholder="Av. Mariscal López 1234"
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Ciudad">
                        <Input
                          value={sucCiudad}
                          onChange={(e) => setSucCiudad(e.target.value)}
                          placeholder="Asunción"
                        />
                      </Field>
                      <Field label="Departamento">
                        <Input
                          value={sucDepartamento}
                          onChange={(e) => setSucDepartamento(e.target.value)}
                          placeholder="Central"
                        />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Teléfono">
                        <Input
                          value={sucTelefono}
                          onChange={(e) => setSucTelefono(e.target.value)}
                          placeholder="+595 21 ..."
                        />
                      </Field>
                      <Field label="Email">
                        <Input
                          type="email"
                          value={sucEmail}
                          onChange={(e) => setSucEmail(e.target.value)}
                          placeholder="centro@empresa.com.py"
                        />
                      </Field>
                    </div>
                  </div>
                )}
              </section>

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
                disabled={crear.isPending}
                className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={crear.isPending}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {crear.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Crear empresa
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ResultadoCreacion({
  resultado,
  onCerrar,
}: {
  resultado: CrearEmpresaResultado;
  onCerrar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiarPassword() {
    if (!resultado.passwordInicial) return;
    await navigator.clipboard.writeText(resultado.passwordInicial);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-5">
      <div className="rounded-md border bg-muted/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Empresa
        </p>
        <p className="mt-1 text-base font-bold">{resultado.empresa.nombreFantasia}</p>
        <p className="text-xs text-muted-foreground">{resultado.empresa.razonSocial}</p>
        <p className="mt-2 font-mono text-xs">
          RUC: {resultado.empresa.ruc}-{resultado.empresa.dv}
        </p>
      </div>

      <div className="rounded-md border bg-muted/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Administrador
        </p>
        <p className="mt-1 text-sm font-medium">{resultado.admin.nombreCompleto}</p>
        <p className="text-xs text-muted-foreground">{resultado.admin.email}</p>
      </div>

      {resultado.sucursal && (
        <div className="rounded-md border bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Primera sucursal
          </p>
          <p className="mt-1 text-sm font-medium">{resultado.sucursal.nombre}</p>
          <p className="font-mono text-xs text-muted-foreground">
            Código: {resultado.sucursal.codigo}
          </p>
        </div>
      )}

      {resultado.passwordInicial && (
        <div className="rounded-md border-2 border-amber-400 bg-amber-50 p-4 dark:border-amber-500 dark:bg-amber-950/30">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-100">
            ⚠️ Contraseña generada — solo se muestra una vez
          </p>
          <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
            Copiala y enviala al cliente por un canal seguro. No la vamos a poder volver a ver.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 select-all rounded-md border border-amber-300 bg-white px-3 py-2 font-mono text-sm dark:border-amber-700 dark:bg-amber-950">
              {resultado.passwordInicial}
            </code>
            <button
              type="button"
              onClick={() => {
                void copiarPassword();
              }}
              className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              <Copy className="h-4 w-4" /> {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Listo
        </button>
      </div>
    </div>
  );
}
