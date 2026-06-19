'use client';

import { calcularDvRuc } from '@smash/shared-utils';
import { Check, Loader2, Save, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import {
  buscarPadronCi,
  type Cliente,
  useActualizarCliente,
  useCrearCliente,
} from '@/hooks/useClientes';
import { useKeyboardInput } from '@/hooks/useKeyboardInput';
import { useNumpadInput } from '@/hooks/useNumpadInput';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export type TipoContribuyente = 'PERSONA_FISICA' | 'PERSONA_JURIDICA' | 'EXTRANJERO';

interface ClienteFormModalProps {
  cliente?: Cliente;
  /** CI con la que arranca el form en un alta (persona física). Se usa cuando
   * el cajero buscó por cédula en el POS: precargamos el documento, lo que
   * además dispara el autocompletado de nombre contra el padrón. Ignorado en
   * edición (cuando se pasa `cliente`). */
  documentoInicial?: string;
  /** Tipo de contribuyente con el que arranca el form en un alta. Lo usa el
   * flujo de cobro con FACTURA, donde conviene arrancar directamente en RUC
   * (persona jurídica). Ignorado en edición (manda el tipo del cliente). */
  tipoInicial?: TipoContribuyente;
  /** Razón social precargada en un alta. Se usa cuando venimos de una
   * sugerencia del padrón y arrancamos en RUC (persona jurídica): ahí el
   * autocompletado por CI no corre, así que pasamos el nombre directo para no
   * perderlo. Ignorado en edición. */
  razonSocialInicial?: string;
  /** Si lo pasás, se llama tras un alta exitosa con el cliente creado.
   * Útil para flujos como POS → "Elegí un cliente" → "+ Nuevo" donde querés
   * preseleccionar el cliente recién creado en el selector. */
  onCreado?: (cliente: Cliente) => void;
  onClose: () => void;
}

const TIPOS = [
  { value: 'PERSONA_FISICA', label: 'Persona física (CI)' },
  { value: 'PERSONA_JURIDICA', label: 'Persona jurídica (RUC)' },
  { value: 'EXTRANJERO', label: 'Extranjero' },
] as const;

export function ClienteFormModal({
  cliente,
  documentoInicial,
  tipoInicial,
  razonSocialInicial,
  onCreado,
  onClose,
}: ClienteFormModalProps) {
  const crear = useCrearCliente();
  const actualizar = useActualizarCliente();
  const isPending = crear.isPending || actualizar.isPending;
  const isEdit = Boolean(cliente);

  // En edición manda el tipo del cliente; en alta usamos el `tipoInicial`
  // sugerido (ej: RUC desde el cobro con FACTURA) y, si no hay, persona física.
  const tipoPorDefecto =
    (cliente?.tipoContribuyente as TipoContribuyente | undefined) ??
    tipoInicial ??
    'PERSONA_FISICA';
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]['value']>(tipoPorDefecto);
  const [razonSocial, setRazonSocial] = useState(cliente?.razonSocial ?? razonSocialInicial ?? '');
  const [nombreFantasia, setNombreFantasia] = useState(cliente?.nombreFantasia ?? '');
  // En alta arrancada en RUC desde una CI buscada (sugerencia del padrón),
  // precargamos el RUC con ese número: el DV se calcula solo a partir de él.
  const [ruc, setRuc] = useState(
    cliente?.ruc ?? (tipoPorDefecto === 'PERSONA_JURIDICA' ? (documentoInicial ?? '') : ''),
  );
  // Para persona física, el "documento" del form es la CI: si en BD no hay
  // `documento` pero sí `ruc` (porque el RUC PF en Paraguay es la misma CI),
  // mostramos el RUC como CI para que el cajero pueda editarlo.
  const [documento, setDocumento] = useState(
    cliente?.documento ??
      (tipoPorDefecto === 'PERSONA_FISICA' ? (cliente?.ruc ?? documentoInicial ?? '') : ''),
  );
  // En PF activamos esto si el cliente quiere RUC para que le emitan factura.
  // En PJ siempre se manda RUC (tiene sentido por definición).
  const [tieneRuc, setTieneRuc] = useState(Boolean(cliente?.ruc));

  // El DV se calcula automáticamente con el algoritmo módulo 11 (que es
  // exactamente lo que valida el backend). Antes lo tipeaba el cajero pero
  // era propenso a errores y no aporta — el DV es determinístico.
  const numeroParaDv = tipo === 'PERSONA_JURIDICA' ? ruc : documento;
  const dvCalculado =
    numeroParaDv && /^\d+$/.test(numeroParaDv) ? String(calcularDvRuc(numeroParaDv)) : '';
  const [email, setEmail] = useState(cliente?.email ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '');
  const [sinRecargoDelivery, setSinRecargoDelivery] = useState(
    cliente?.sinRecargoDelivery ?? false,
  );
  const [error, setError] = useState<string | null>(null);

  // Autocompletado contra el padrón de cédulas (CI → nombre/apellido).
  // Sólo aplica a persona física. `valorAutollenadoRef` guarda lo último que
  // escribimos nosotros en razonSocial: sólo pisamos el campo si sigue vacío o
  // si conserva ese valor (es decir, el cajero no lo editó a mano).
  const [padronStatus, setPadronStatus] = useState<
    'idle' | 'buscando' | 'encontrado' | 'no-encontrado'
  >('idle');
  const valorAutollenadoRef = useRef<string>(cliente?.razonSocial ?? razonSocialInicial ?? '');

  useEffect(() => {
    // En edición no autocompletamos: respetamos lo que ya está cargado.
    if (isEdit || tipo !== 'PERSONA_FISICA') {
      setPadronStatus('idle');
      return;
    }
    const ci = documento.trim();
    if (!/^\d{4,}$/.test(ci)) {
      setPadronStatus('idle');
      return;
    }

    let cancelado = false;
    setPadronStatus('buscando');
    const t = setTimeout(() => {
      void buscarPadronCi(ci)
        .then((res) => {
          if (cancelado) return;
          if (!res) {
            setPadronStatus('no-encontrado');
            return;
          }
          setPadronStatus('encontrado');
          const nombreCompleto = `${res.nombre} ${res.apellido}`.replace(/\s+/g, ' ').trim();
          // No pisar lo que el cajero escribió a mano.
          setRazonSocial((actual) => {
            if (actual.trim() === '' || actual === valorAutollenadoRef.current) {
              valorAutollenadoRef.current = nombreCompleto;
              return nombreCompleto;
            }
            return actual;
          });
        })
        .catch(() => {
          if (!cancelado) setPadronStatus('idle');
        });
    }, 400);

    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [documento, tipo, isEdit]);

  // Hooks de teclado virtual (solo activos para rol CAJERO; admins no los notan)
  const razonSocialKb = useKeyboardInput({
    value: razonSocial,
    onChange: setRazonSocial,
    label: 'Razón social',
    maxLength: 100,
  });
  const nombreFantasiaKb = useKeyboardInput({
    value: nombreFantasia,
    onChange: setNombreFantasia,
    label: 'Nombre de fantasía',
    maxLength: 100,
  });
  const documentoNp = useNumpadInput({
    value: documento,
    onChange: (v) => setDocumento(v.replace(/\D/g, '')),
    label: tipo === 'PERSONA_FISICA' ? 'Cédula' : 'Documento',
    maxLength: 10,
  });
  const documentoKb = useKeyboardInput({
    value: documento,
    onChange: setDocumento,
    label: 'Documento (pasaporte/DNI)',
    maxLength: 30,
  });
  const rucNp = useNumpadInput({
    value: ruc,
    onChange: (v) => setRuc(v.replace(/\D/g, '')),
    label: 'RUC',
    maxLength: 8,
  });
  const emailKb = useKeyboardInput({
    value: email,
    onChange: setEmail,
    label: 'Email',
    maxLength: 80,
  });
  const telefonoNp = useNumpadInput({
    value: telefono,
    onChange: setTelefono,
    label: 'Teléfono',
    maxLength: 15,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!razonSocial.trim()) return setError('Razón social requerida');

    // En Paraguay el RUC de persona física es la CI + un DV. Por eso para
    // PERSONA_FISICA usamos un único campo "Cédula" + DV opcional. Si el
    // cajero carga DV, se manda como RUC (con CI como documento). Si no, se
    // manda sólo como documento.
    let rucFinal: string | undefined;
    let dvFinal: string | undefined;
    let docFinal: string | undefined;

    if (tipo === 'PERSONA_FISICA') {
      const cedula = documento.trim();
      docFinal = cedula || undefined;
      if (cedula && tieneRuc && /^\d+$/.test(cedula)) {
        rucFinal = cedula;
        dvFinal = String(calcularDvRuc(cedula));
      }
    } else if (tipo === 'PERSONA_JURIDICA') {
      const rucNum = ruc.trim();
      if (!rucNum || !/^\d+$/.test(rucNum)) {
        return setError('RUC requerido (sólo números)');
      }
      rucFinal = rucNum;
      dvFinal = String(calcularDvRuc(rucNum));
    } else {
      // EXTRANJERO: sólo documento (pasaporte / DNI extranjero)
      docFinal = documento.trim() || undefined;
    }

    const body = {
      tipoContribuyente: tipo,
      razonSocial: razonSocial.trim(),
      nombreFantasia: nombreFantasia.trim() || undefined,
      ruc: rucFinal,
      dv: dvFinal,
      documento: docFinal,
      email: email.trim() || undefined,
      telefono: telefono.trim() || undefined,
      sinRecargoDelivery,
    };

    try {
      if (cliente) {
        await actualizar.mutateAsync({ id: cliente.id, ...body });
        toast.success('Cliente actualizado');
        onClose();
      } else {
        const res = await crear.mutateAsync(body);
        toast.success('Cliente creado');
        if (onCreado) onCreado(res.cliente);
        else onClose();
      }
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      const msg = apiErr?.message ?? 'Error al guardar';
      if (apiErr?.details && typeof apiErr.details === 'object') {
        const fields = (apiErr.details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
        if (fields) {
          const primeraClave = Object.keys(fields)[0];
          if (primeraClave && fields[primeraClave]?.[0]) {
            setError(`${primeraClave}: ${fields[primeraClave][0]}`);
            return;
          }
        }
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
        className="w-full max-w-2xl overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</h2>
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
          className="space-y-4 p-5"
        >
          <Field label="Tipo de contribuyente">
            <div className="grid gap-2 sm:grid-cols-3">
              {TIPOS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTipo(t.value)}
                  className={cn(
                    'rounded-md border p-2 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    tipo === t.value
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                      : 'border-input hover:bg-accent',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Razón social" required>
            <Input
              autoFocus
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder={tipo === 'PERSONA_FISICA' ? 'Juan Pérez' : 'EMPRESA S.A.'}
              {...razonSocialKb.inputProps}
            />
          </Field>

          {tipo === 'PERSONA_JURIDICA' && (
            <Field label="Nombre de fantasía">
              <Input
                value={nombreFantasia}
                onChange={(e) => setNombreFantasia(e.target.value)}
                placeholder="Nombre comercial"
                {...nombreFantasiaKb.inputProps}
              />
            </Field>
          )}

          {tipo === 'PERSONA_FISICA' && (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_80px]">
                <Field label="Cédula de identidad" required>
                  <Input
                    value={documento}
                    onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ''))}
                    className="font-mono"
                    placeholder="1234567"
                    {...documentoNp.inputProps}
                  />
                  {padronStatus === 'buscando' && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Buscando en el padrón…
                    </p>
                  )}
                  {padronStatus === 'encontrado' && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                      <Check className="h-3 w-3" />
                      Nombre cargado desde el padrón
                    </p>
                  )}
                  {padronStatus === 'no-encontrado' && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      CI no está en el padrón — cargá el nombre a mano
                    </p>
                  )}
                </Field>
                <Field label="DV" hint="Calculado automático">
                  <Input
                    value={tieneRuc ? dvCalculado : ''}
                    readOnly
                    className="bg-muted/40 text-center font-mono"
                    placeholder="—"
                  />
                </Field>
              </div>
              <SwitchField
                label="Tiene RUC para factura"
                description="Activá si el cliente solicita FACTURA. El RUC PF en Paraguay es la CI + DV."
                checked={tieneRuc}
                onCheckedChange={setTieneRuc}
              />
            </>
          )}

          {tipo === 'PERSONA_JURIDICA' && (
            <div className="grid gap-3 sm:grid-cols-[1fr_80px]">
              <Field label="RUC (sin DV)" required>
                <Input
                  value={ruc}
                  onChange={(e) => setRuc(e.target.value.replace(/\D/g, ''))}
                  className="font-mono"
                  placeholder="80012345"
                  maxLength={8}
                  {...rucNp.inputProps}
                />
              </Field>
              <Field label="DV" hint="Calculado automático">
                <Input
                  value={dvCalculado}
                  readOnly
                  className="bg-muted/40 text-center font-mono"
                  placeholder="—"
                />
              </Field>
            </div>
          )}

          {tipo === 'EXTRANJERO' && (
            <Field label="Documento (pasaporte / DNI)">
              <Input
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                className="font-mono"
                placeholder="AB123456"
                {...documentoKb.inputProps}
              />
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contacto@cliente.com"
                {...emailKb.inputProps}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+595 981 123 456"
                {...telefonoNp.inputProps}
              />
            </Field>
          </div>

          <SwitchField
            label="Sin recargo de delivery"
            description="VIP / empleados / convenios: los pedidos de delivery de este cliente no suman recargo aunque la sucursal lo tenga configurado."
            checked={sinRecargoDelivery}
            onCheckedChange={setSinRecargoDelivery}
          />

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
