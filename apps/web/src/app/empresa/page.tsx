'use client';

import {
  Building2,
  Image as ImageIcon,
  Loader2,
  Save,
  Settings as SettingsIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { toast } from '@/components/Toast';
import { Field, Input } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import {
  type Empresa,
  useActualizarConfiguracion,
  useActualizarEmpresa,
  useEmpresa,
} from '@/hooks/useEmpresa';
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
    </div>
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
  const [dv, setDv] = useState(empresa.dv);
  const [direccion, setDireccion] = useState(empresa.direccion ?? '');
  const [telefono, setTelefono] = useState(empresa.telefono ?? '');
  const [email, setEmail] = useState(empresa.email ?? '');
  const [logoUrl, setLogoUrl] = useState(empresa.logoUrl ?? '');
  const [colorPrimario, setColorPrimario] = useState(empresa.colorPrimario ?? '#0099E6');
  const [colorSecundario, setColorSecundario] = useState(empresa.colorSecundario ?? '#1A1A1A');
  const [zonaHoraria, setZonaHoraria] = useState(empresa.zonaHoraria);
  const [error, setError] = useState<string | null>(null);

  // Refrescar valores cuando cambia el dato externo
  useEffect(() => {
    setNombreFantasia(empresa.nombreFantasia);
    setRazonSocial(empresa.razonSocial);
    setRuc(empresa.ruc);
    setDv(empresa.dv);
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
          <Field label="DV" required>
            <Input
              value={dv}
              onChange={(e) => setDv(e.target.value.replace(/\D/g, '').slice(0, 1))}
              className="text-center font-mono"
              maxLength={1}
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
      </div>
    </section>
  );
}

void ImageIcon;
