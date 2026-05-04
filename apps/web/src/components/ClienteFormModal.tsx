'use client';

import { calcularDvRuc } from '@smash/shared-utils';
import { Loader2, Save, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import { type Cliente, useActualizarCliente, useCrearCliente } from '@/hooks/useClientes';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ClienteFormModalProps {
  cliente?: Cliente;
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

export function ClienteFormModal({ cliente, onCreado, onClose }: ClienteFormModalProps) {
  const crear = useCrearCliente();
  const actualizar = useActualizarCliente();
  const isPending = crear.isPending || actualizar.isPending;
  const isEdit = Boolean(cliente);

  const tipoInicial =
    (cliente?.tipoContribuyente as (typeof TIPOS)[number]['value']) ?? 'PERSONA_FISICA';
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]['value']>(tipoInicial);
  const [razonSocial, setRazonSocial] = useState(cliente?.razonSocial ?? '');
  const [nombreFantasia, setNombreFantasia] = useState(cliente?.nombreFantasia ?? '');
  const [ruc, setRuc] = useState(cliente?.ruc ?? '');
  // Para persona física, el "documento" del form es la CI: si en BD no hay
  // `documento` pero sí `ruc` (porque el RUC PF en Paraguay es la misma CI),
  // mostramos el RUC como CI para que el cajero pueda editarlo.
  const [documento, setDocumento] = useState(
    cliente?.documento ?? (tipoInicial === 'PERSONA_FISICA' ? (cliente?.ruc ?? '') : ''),
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
  const [error, setError] = useState<string | null>(null);

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
            />
          </Field>

          {tipo === 'PERSONA_JURIDICA' && (
            <Field label="Nombre de fantasía">
              <Input
                value={nombreFantasia}
                onChange={(e) => setNombreFantasia(e.target.value)}
                placeholder="Nombre comercial"
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
                  />
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
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+595 981 123 456"
              />
            </Field>
          </div>

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
