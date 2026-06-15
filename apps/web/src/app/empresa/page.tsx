'use client';

import { calcularDvRuc } from '@smash/shared-utils';
import {
  Building2,
  Image as ImageIcon,
  Loader2,
  Receipt,
  Save,
  Settings as SettingsIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { toast } from '@/components/Toast';
import { Field, Input, Select } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import {
  type Empresa,
  useActualizarConfiguracion,
  useActualizarEmpresa,
  useEmpresa,
} from '@/hooks/useEmpresa';
import { useFacturacionConfig, useGuardarFacturacionConfig } from '@/hooks/useFacturacionConfig';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function EmpresaPage() {
  return (
    <AuthGate>
      <AdminShell>
        <EmpresaScreen />
      </AdminShell>
    </AuthGate>
  );
}

function EmpresaScreen() {
  const rol = useAuthStore((s) => s.user?.rol);
  const empresaOperando = useAuthStore((s) => s.empresaOperando);
  // SUPER_ADMIN sin estar "operando como empresa X" no tiene una empresa
  // propia: mostrar atajo al panel admin. Si está operando, sí cargamos la
  // empresa target (el endpoint `/empresa/mi-empresa` mira req.context.empresaId
  // que va a estar seteada al hacer "operar como").
  const esSuperAdminSinEmpresa = rol === 'SUPER_ADMIN' && !empresaOperando;

  const { data: empresa, isLoading, isError } = useEmpresa({ enabled: !esSuperAdminSinEmpresa });

  if (esSuperAdminSinEmpresa) {
    return (
      <div className="rounded-md border bg-muted/20 p-6 text-sm">
        <h1 className="mb-2 flex items-center gap-2 text-lg font-bold">
          <Building2 className="h-5 w-5 text-primary" />
          Empresa
        </h1>
        <p className="text-muted-foreground">
          Tu rol <strong>SUPER_ADMIN</strong> no tiene una empresa propia. Para administrar las
          empresas del sistema, andá al panel{' '}
          <Link href="/admin/empresas" className="font-medium text-primary hover:underline">
            Super-admin · Empresas
          </Link>
          . Para configurar una empresa específica, primero clickeá <strong>Operar</strong> en la
          fila correspondiente.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !empresa) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error cargando los datos de la empresa.
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Building2 className="h-6 w-6 text-primary" />
          Empresa
        </h1>
        <p className="text-sm text-muted-foreground">
          {empresa._count.sucursales} sucursal{empresa._count.sucursales !== 1 ? 'es' : ''} ·{' '}
          {empresa._count.usuarios} usuario{empresa._count.usuarios !== 1 ? 's' : ''}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <DatosFiscalesCard empresa={empresa} />
        <ConfiguracionCard empresa={empresa} />
      </div>

      <div className="mt-6">
        <FacturacionElectronicaCard />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Facturación electrónica (CODE100)
// ───────────────────────────────────────────────────────────────────────────

function FacturacionElectronicaCard() {
  const { data: config, isLoading } = useFacturacionConfig();
  const guardar = useGuardarFacturacionConfig();

  const [ambienteActivo, setAmbienteActivo] = useState<'TEST' | 'PROD'>('TEST');
  const [tipoContribuyente, setTipoContribuyente] = useState<'1' | '2'>('2');
  const [activo, setActivo] = useState(false);
  // Credenciales por ambiente.
  const [test, setTest] = useState({ dominio: '', ruc: '', password: '' });
  const [prod, setProd] = useState({ dominio: '', ruc: '', password: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config?.configurado) return;
    setAmbienteActivo(config.ambienteActivo ?? 'TEST');
    setTipoContribuyente(config.emisorTipoContribuyente === 1 ? '1' : '2');
    setActivo(config.activo ?? false);
    setTest({ dominio: config.test?.dominio ?? '', ruc: config.test?.ruc ?? '', password: '' });
    setProd({ dominio: config.prod?.dominio ?? '', ruc: config.prod?.ruc ?? '', password: '' });
  }, [config]);

  const testTienePass = config?.test?.tienePassword ?? false;
  const prodTienePass = config?.prod?.tienePassword ?? false;

  /** Arma el bloque de credenciales para el body sólo si el ambiente tiene datos. */
  function bloque(amb: { dominio: string; ruc: string; password: string }) {
    if (!amb.dominio.trim() && !amb.ruc.trim() && !amb.password.trim()) return undefined;
    return {
      dominio: amb.dominio.trim(),
      ruc: amb.ruc.trim(),
      ...(amb.password.trim() ? { password: amb.password.trim() } : {}),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const activoCred = ambienteActivo === 'TEST' ? test : prod;
    const activoTienePass = ambienteActivo === 'TEST' ? testTienePass : prodTienePass;
    if (!/^https?:\/\//.test(activoCred.dominio)) {
      return setError(`Cargá el dominio del ambiente activo (${ambienteActivo})`);
    }
    if (!/^\d{3,8}$/.test(activoCred.ruc)) {
      return setError(`RUC del ambiente activo (${ambienteActivo}) debe tener 3-8 dígitos`);
    }
    if (!activoTienePass && !activoCred.password.trim()) {
      return setError(`Cargá el password del ambiente activo (${ambienteActivo})`);
    }

    try {
      await guardar.mutateAsync({
        ambienteActivo,
        emisorTipoContribuyente: tipoContribuyente === '1' ? 1 : 2,
        activo,
        test: bloque(test),
        prod: bloque(prod),
      });
      setTest((s) => ({ ...s, password: '' }));
      setProd((s) => ({ ...s, password: '' }));
      toast.success('Configuración de facturación guardada');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar');
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="rounded-lg border bg-card p-5"
    >
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        <Receipt className="h-4 w-4" /> Facturación electrónica (CODE100)
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Credenciales del middleware FUTURA100. Se guardan los dos ambientes; el switch elige contra
        cuál se emite. Los passwords se guardan cifrados y nunca se muestran.
        {config?.configurado &&
          ` Última actualización: ${new Date(config.updatedAt ?? '').toLocaleDateString('es-PY')}.`}
      </p>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Ambiente activo"
            required
            hint="Contra cuál se emite ahora. Empezá en TEST hasta que te habiliten producción."
          >
            <Select
              value={ambienteActivo}
              onChange={(e) => setAmbienteActivo(e.target.value as 'TEST' | 'PROD')}
            >
              <option value="TEST">Pruebas (TEST)</option>
              <option value="PROD">Producción (PROD)</option>
            </Select>
          </Field>
          <Field label="Tipo de contribuyente del emisor" required>
            <Select
              value={tipoContribuyente}
              onChange={(e) => setTipoContribuyente(e.target.value as '1' | '2')}
            >
              <option value="2">Persona Jurídica</option>
              <option value="1">Persona Física</option>
            </Select>
          </Field>
        </div>

        <AmbienteCredsBlock
          titulo="Pruebas (TEST)"
          activo={ambienteActivo === 'TEST'}
          creds={test}
          tienePassword={testTienePass}
          onChange={setTest}
          disabled={guardar.isPending}
        />
        <AmbienteCredsBlock
          titulo="Producción (PROD)"
          activo={ambienteActivo === 'PROD'}
          creds={prod}
          tienePassword={prodTienePass}
          onChange={setProd}
          disabled={guardar.isPending}
        />

        <SwitchField
          label="Activar envío a SIFEN"
          description="Si está activo, los comprobantes fiscales se envían automáticamente al emitirse. Desactivado: se emiten pero no se envían."
          checked={activo}
          onCheckedChange={setActivo}
          disabled={guardar.isPending}
        />

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={guardar.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {guardar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar
          </button>
        </div>
      </div>
    </form>
  );
}

function AmbienteCredsBlock({
  titulo,
  activo,
  creds,
  tienePassword,
  onChange,
  disabled,
}: {
  titulo: string;
  activo: boolean;
  creds: { dominio: string; ruc: string; password: string };
  tienePassword: boolean;
  onChange: (v: { dominio: string; ruc: string; password: string }) => void;
  disabled: boolean;
}) {
  return (
    <fieldset
      className={cn(
        'rounded-md border p-4',
        activo ? 'border-primary/40 bg-primary/5' : 'border-input',
      )}
    >
      <legend className="px-1 text-xs font-semibold">
        {titulo}
        {activo && (
          <span className="ml-2 text-[10px] font-bold uppercase text-primary">activo</span>
        )}
      </legend>
      <div className="space-y-3">
        <Field label="Dominio del webservice" hint="Ej: https://webservice.futura100.com.py">
          <Input
            value={creds.dominio}
            onChange={(e) => onChange({ ...creds, dominio: e.target.value })}
            placeholder="https://webservice.futura100.com.py"
            disabled={disabled}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="RUC (sin dígito verificador)">
            <Input
              value={creds.ruc}
              onChange={(e) => onChange({ ...creds, ruc: e.target.value })}
              placeholder="80012345"
              disabled={disabled}
            />
          </Field>
          <Field
            label="Password del proveedor"
            hint={tienePassword ? 'Dejá vacío para conservar el actual' : undefined}
          >
            <Input
              type="password"
              value={creds.password}
              onChange={(e) => onChange({ ...creds, password: e.target.value })}
              placeholder={tienePassword ? '•••••••• (sin cambios)' : 'Password CODE100'}
              autoComplete="new-password"
              disabled={disabled}
            />
          </Field>
        </div>
      </div>
    </fieldset>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Datos fiscales + identidad
// ───────────────────────────────────────────────────────────────────────────

function DatosFiscalesCard({ empresa }: { empresa: Empresa }) {
  const actualizar = useActualizarEmpresa();

  const [nombreFantasia, setNombreFantasia] = useState(empresa.nombreFantasia);
  const [razonSocial, setRazonSocial] = useState(empresa.razonSocial);
  const [ruc, setRuc] = useState(empresa.ruc);
  const [direccion, setDireccion] = useState(empresa.direccion ?? '');
  const [telefono, setTelefono] = useState(empresa.telefono ?? '');
  const [email, setEmail] = useState(empresa.email ?? '');
  const [logoUrl, setLogoUrl] = useState(empresa.logoUrl ?? '');
  const [colorPrimario, setColorPrimario] = useState(empresa.colorPrimario ?? '#0099E6');
  const [colorSecundario, setColorSecundario] = useState(empresa.colorSecundario ?? '#1A1A1A');
  const [zonaHoraria, setZonaHoraria] = useState(empresa.zonaHoraria);
  const [error, setError] = useState<string | null>(null);

  // DV derivado del RUC (módulo 11 SET) — se autocompleta, no se edita a mano.
  const dv = /^\d+$/.test(ruc) ? String(calcularDvRuc(ruc)) : '';

  // Refrescar valores cuando cambia el dato externo
  useEffect(() => {
    setNombreFantasia(empresa.nombreFantasia);
    setRazonSocial(empresa.razonSocial);
    setRuc(empresa.ruc);
    setDireccion(empresa.direccion ?? '');
    setTelefono(empresa.telefono ?? '');
    setEmail(empresa.email ?? '');
    setLogoUrl(empresa.logoUrl ?? '');
    setColorPrimario(empresa.colorPrimario ?? '#0099E6');
    setColorSecundario(empresa.colorSecundario ?? '#1A1A1A');
    setZonaHoraria(empresa.zonaHoraria);
  }, [empresa]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!razonSocial.trim()) return setError('Razón social requerida');
    if (!/^\d{6,8}$/.test(ruc)) return setError('RUC debe tener 6-8 dígitos');
    if (!/^\d$/.test(dv)) return setError('DV debe ser 1 dígito');

    try {
      await actualizar.mutateAsync({
        nombreFantasia: nombreFantasia.trim(),
        razonSocial: razonSocial.trim(),
        ruc,
        dv,
        direccion: direccion.trim() || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        logoUrl: logoUrl.trim() || null,
        colorPrimario: colorPrimario.trim() || null,
        colorSecundario: colorSecundario.trim() || null,
        zonaHoraria: zonaHoraria.trim(),
      });
      toast.success('Datos de empresa guardados');
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
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="rounded-lg border bg-card p-5"
    >
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Datos fiscales e identidad
      </h2>

      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre fantasía" required>
            <Input
              value={nombreFantasia}
              onChange={(e) => setNombreFantasia(e.target.value)}
              placeholder="Smash Burgers"
            />
          </Field>
          <Field label="Razón social" required>
            <Input
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="SMASH BURGERS PARAGUAY S.A."
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_80px]">
          <Field label="RUC" required>
            <Input
              value={ruc}
              onChange={(e) => setRuc(e.target.value.replace(/\D/g, '').slice(0, 8))}
              className="font-mono"
              placeholder="80012345"
              maxLength={8}
            />
          </Field>
          <Field label="DV" hint="Automático">
            <Input
              value={dv}
              readOnly
              tabIndex={-1}
              className="text-center font-mono bg-muted/40 cursor-not-allowed"
              placeholder="—"
            />
          </Field>
        </div>

        <Field label="Dirección">
          <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Teléfono">
            <Input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+595 ..."
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

        <Field label="URL del logo">
          <Input
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://..."
          />
        </Field>
        {logoUrl && (
          <div className="flex items-center gap-3 rounded-md border bg-muted/20 p-2">
            <img
              src={logoUrl}
              alt="Logo preview"
              className="h-12 w-12 rounded border bg-card object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <span className="text-xs text-muted-foreground">Vista previa del logo</span>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <ColorField label="Color primario" value={colorPrimario} onChange={setColorPrimario} />
          <ColorField
            label="Color secundario"
            value={colorSecundario}
            onChange={setColorSecundario}
          />
        </div>

        <Field label="Zona horaria" hint="ej: America/Asuncion">
          <Input value={zonaHoraria} onChange={(e) => setZonaHoraria(e.target.value)} />
        </Field>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={actualizar.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {actualizar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar datos
          </button>
        </div>
      </div>
    </form>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint="Hex #RRGGBB">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
          placeholder="#0099E6"
        />
      </div>
    </Field>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  Configuración operativa
// ───────────────────────────────────────────────────────────────────────────

function ConfiguracionCard({ empresa }: { empresa: Empresa }) {
  const actualizar = useActualizarConfiguracion();

  async function update(patch: Partial<typeof empresa.configuracion>) {
    try {
      await actualizar.mutateAsync(patch);
      toast.success('Configuración actualizada');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        <SettingsIcon className="h-4 w-4" /> Configuración operativa
      </h2>

      <div className="space-y-1 divide-y">
        <SwitchField
          label="Permitir stock negativo"
          description="Si está activo, se permiten ventas aunque no haya stock suficiente. Útil para pre-venta o ajuste posterior."
          checked={empresa.configuracion.permitirStockNegativo}
          onCheckedChange={(v) => {
            void update({ permitirStockNegativo: v });
          }}
          disabled={actualizar.isPending}
        />
        <SwitchField
          label="Redondear totales"
          description="Redondea totales a unidades de Gs. 50 o 100 al emitir comprobantes."
          checked={empresa.configuracion.redondearTotales}
          onCheckedChange={(v) => {
            void update({ redondearTotales: v });
          }}
          disabled={actualizar.isPending}
        />
        <SwitchField
          label="IVA incluido en el precio"
          description="Los precios mostrados ya incluyen IVA. Standard en Paraguay."
          checked={empresa.configuracion.ivaIncluidoEnPrecio}
          onCheckedChange={(v) => {
            void update({ ivaIncluidoEnPrecio: v });
          }}
          disabled={actualizar.isPending}
        />
        <SwitchField
          label="Emitir TICKET por default"
          description="En el POS, modo MOSTRADOR emite TICKET salvo que se elija FACTURA explícitamente."
          checked={empresa.configuracion.emitirTicketPorDefecto}
          onCheckedChange={(v) => {
            void update({ emitirTicketPorDefecto: v });
          }}
          disabled={actualizar.isPending}
        />
        <PorcentajeDescuentoEmpleadoField
          valor={empresa.configuracion.porcentajeDescuentoEmpleado}
          onChange={(n) => {
            void update({ porcentajeDescuentoEmpleado: n });
          }}
          disabled={actualizar.isPending}
        />
      </div>
    </section>
  );
}

/** Input numérico 0–100. Commit en blur o Enter (no en cada tecla). */
function PorcentajeDescuentoEmpleadoField({
  valor,
  onChange,
  disabled,
}: {
  valor: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(valor));
  // Si cambia el valor del servidor (otro tab, refetch), resincroniza.
  useEffect(() => {
    setDraft(String(valor));
  }, [valor]);

  function commit() {
    const n = Number.parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setDraft(String(valor));
      return;
    }
    if (n !== valor) onChange(n);
  }

  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="flex-1">
        <p className="text-sm font-medium leading-tight">% de descuento empleado</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Se aplica cuando el cajero marca una venta como descuento empleado. Cada empleado puede
          usarlo 1 vez por día.
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          max={100}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          disabled={disabled}
          className="w-20 text-right"
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
    </div>
  );
}

void ImageIcon;
