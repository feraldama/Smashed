'use client';

import { Gift, Loader2, Percent, ShieldAlert, UserCircle, Wallet, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input, Select } from '@/components/ui/Input';
import {
  type AplicarDescuentoInput,
  CODIGO_MOTIVO_DESCUENTO_EMPLEADO,
  type MotivoDescuento,
  type PedidoConDescuento,
  type TipoDescuento,
  useAplicarDescuento,
  useEmpleadosBeneficiarios,
  useMotivosDescuento,
  useVerificarSupervisor,
} from '@/hooks/useDescuento';
import { useEmpresa } from '@/hooks/useEmpresa';
import { ApiError } from '@/lib/api';
import { cn, formatGs } from '@/lib/utils';

interface Props {
  pedidoId: string;
  /** Subtotal + IVA del pedido (lo que paga el cliente sin descuento ni recargo). */
  base: number;
  onCancel: () => void;
  onAplicado: (pedido: PedidoConDescuento) => void;
}

const PRESETS_PORCENTAJE = [5, 10, 15, 20] as const;

export function DescuentoModal({ pedidoId, base, onCancel, onAplicado }: Props) {
  const { data: motivos = [], isLoading: cargandoMotivos } = useMotivosDescuento();
  const { data: empresa } = useEmpresa();
  const { data: empleados = [], isLoading: cargandoEmpleados } = useEmpleadosBeneficiarios();
  const aplicar = useAplicarDescuento(pedidoId);

  const [tipo, setTipo] = useState<TipoDescuento>('PORCENTAJE');
  // Para PORCENTAJE guardamos el valor "humano" (15 = 15%); convertimos al wire al enviar.
  // Para MONTO guardamos Gs. directos.
  const [valor, setValor] = useState<string>('10');
  const [motivoId, setMotivoId] = useState<string>('');
  const [empleadoBeneficiarioId, setEmpleadoBeneficiarioId] = useState<string>('');
  const [observacion, setObservacion] = useState('');
  const [escalado, setEscalado] = useState<EscaladoState | null>(null);

  // Auto-seleccionar primer motivo cuando cargan.
  if (!motivoId && motivos.length > 0 && motivos[0]) {
    setMotivoId(motivos[0].id);
  }

  const motivoActual = motivos.find((m) => m.id === motivoId) ?? null;
  const esMotivoEmpleado = motivoActual?.codigoSistema === CODIGO_MOTIVO_DESCUENTO_EMPLEADO;
  const porcentajeEmpleado = empresa?.configuracion.porcentajeDescuentoEmpleado ?? 50;

  // Si el cajero cambia a un motivo no-empleado, descartamos el beneficiario.
  if (!esMotivoEmpleado && empleadoBeneficiarioId) {
    setEmpleadoBeneficiarioId('');
  }

  // ───── Preview del descuento ─────
  const previewMonto = useMemo(() => {
    if (esMotivoEmpleado) return Math.floor((base * porcentajeEmpleado) / 100);
    const n = Number.parseFloat(valor.replace(',', '.'));
    if (tipo === 'CORTESIA') return base;
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (tipo === 'PORCENTAJE') return Math.floor((base * n) / 100);
    return Math.min(n, base); // MONTO cappeado a la base
  }, [tipo, valor, base, esMotivoEmpleado, porcentajeEmpleado]);

  const totalConDescuento = Math.max(0, base - previewMonto);

  function validar(): string | null {
    if (!motivoId) return 'Elegí un motivo';
    if (esMotivoEmpleado) {
      if (!empleadoBeneficiarioId) return 'Elegí el empleado beneficiario';
      return null;
    }
    if (tipo === 'CORTESIA') return null;
    const n = Number.parseFloat(valor.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return 'Ingresá un valor mayor a 0';
    if (tipo === 'PORCENTAJE' && n > 100) return 'El porcentaje no puede superar 100%';
    return null;
  }

  function buildPayload(auth?: {
    supervisorAuth?: { email: string; password: string };
    codigo?: string;
  }): AplicarDescuentoInput {
    // Motivo del sistema: tipo/valor son ignorados por el backend; mandamos
    // PORCENTAJE + 0 como placeholder (zod exige enum válido). El % real lo
    // calcula el backend desde la config de la empresa.
    if (esMotivoEmpleado) {
      return {
        tipo: 'PORCENTAJE',
        valor: 0,
        motivoDescuentoId: motivoId,
        empleadoBeneficiarioId,
        observacion: observacion.trim() || undefined,
        supervisorAuth: auth?.supervisorAuth,
        codigoAutorizacion: auth?.codigo,
      };
    }
    let valorWire = 0;
    if (tipo === 'PORCENTAJE') {
      valorWire = Math.round(Number.parseFloat(valor.replace(',', '.')) * 100);
    } else if (tipo === 'MONTO') {
      valorWire = Math.round(Number.parseFloat(valor.replace(',', '.')));
    }
    return {
      tipo,
      valor: valorWire,
      motivoDescuentoId: motivoId,
      observacion: observacion.trim() || undefined,
      supervisorAuth: auth?.supervisorAuth,
      codigoAutorizacion: auth?.codigo,
    };
  }

  async function aplicarConPayload(payload: AplicarDescuentoInput) {
    try {
      const res = await aplicar.mutateAsync(payload);
      toast.success('Descuento aplicado');
      onAplicado(res.pedido);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // Excede el límite del cajero — abrimos el escalado.
        setEscalado({ payloadBase: payload, errorMsg: err.message });
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'Error al aplicar descuento');
    }
  }

  async function handleAplicar() {
    const error = validar();
    if (error) {
      toast.error(error);
      return;
    }
    await aplicarConPayload(buildPayload());
  }

  // ───── Render ─────
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 font-bold">
            <Percent className="h-4 w-4 text-primary" /> Aplicar descuento
          </h2>
          <button type="button" onClick={onCancel} className="rounded-sm p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Paso 1: Motivo — primero, porque cambia todo el flujo si es del sistema */}
          <Field label="1. Motivo (obligatorio)">
            {cargandoMotivos ? (
              <p className="text-xs text-muted-foreground">Cargando motivos…</p>
            ) : motivos.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                No hay motivos configurados. Pedile al admin que cree motivos en /descuentos.
              </p>
            ) : (
              <Select value={motivoId} onChange={(e) => setMotivoId(e.target.value)}>
                {motivos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                    {m.requiereAutorizacion ? ' (escala siempre)' : ''}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {esMotivoEmpleado ? (
            <>
              {/* Selector de empleado beneficiario */}
              <Field
                label="2. Empleado beneficiario"
                hint={`Se aplica ${porcentajeEmpleado}% — máximo 1 descuento por día por empleado`}
              >
                {cargandoEmpleados ? (
                  <p className="text-xs text-muted-foreground">Cargando empleados…</p>
                ) : empleados.length === 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    No hay empleados habilitados. Marcá un usuario como empleado en /usuarios.
                  </p>
                ) : (
                  <Select
                    value={empleadoBeneficiarioId}
                    onChange={(e) => setEmpleadoBeneficiarioId(e.target.value)}
                  >
                    <option value="">— Elegir empleado —</option>
                    {empleados.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nombreCompleto}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
                <UserCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  El porcentaje ({porcentajeEmpleado}%) se configura en la sección de empresa. El
                  cajero no lo puede modificar acá.
                </span>
              </div>
            </>
          ) : (
            <>
              {/* Paso 2: Tipo */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  2. Tipo de descuento
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <TipoBtn
                    active={tipo === 'PORCENTAJE'}
                    icon={<Percent className="h-4 w-4" />}
                    label="%"
                    hint="Porcentaje"
                    onClick={() => setTipo('PORCENTAJE')}
                  />
                  <TipoBtn
                    active={tipo === 'MONTO'}
                    icon={<Wallet className="h-4 w-4" />}
                    label="Gs."
                    hint="Monto fijo"
                    onClick={() => setTipo('MONTO')}
                  />
                  <TipoBtn
                    active={tipo === 'CORTESIA'}
                    icon={<Gift className="h-4 w-4" />}
                    label="Cortesía"
                    hint="100% off"
                    onClick={() => setTipo('CORTESIA')}
                  />
                </div>
              </div>

              {/* Paso 3: Presets (solo para PORCENTAJE) */}
              {tipo === 'PORCENTAJE' && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    3. Presets rápidos
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {PRESETS_PORCENTAJE.map((p) => {
                      const active = Number.parseFloat(valor.replace(',', '.')) === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setValor(String(p))}
                          className={cn(
                            'rounded-md border py-2 text-sm font-semibold transition-colors',
                            active
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input hover:bg-accent',
                          )}
                        >
                          {p}%
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Paso 4: Valor */}
              {tipo !== 'CORTESIA' && (
                <Field
                  label={tipo === 'PORCENTAJE' ? '4. Otro porcentaje (%)' : '4. Monto (Gs.)'}
                  hint={
                    tipo === 'PORCENTAJE'
                      ? 'Aplica sobre el subtotal del pedido'
                      : 'Se descuenta este monto exacto (cappeado al subtotal)'
                  }
                >
                  <Input
                    type="number"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    min={0}
                    max={tipo === 'PORCENTAJE' ? 100 : undefined}
                    step={tipo === 'PORCENTAJE' ? '0.01' : '500'}
                    placeholder={tipo === 'PORCENTAJE' ? '15' : '5000'}
                  />
                </Field>
              )}
            </>
          )}

          {/* Observación: oculta para descuento empleado (no aporta) */}
          {!esMotivoEmpleado && (
            <Field label="5. Observación (opcional)">
              <Input
                type="text"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                maxLength={500}
                placeholder="Ej: Cliente frecuente, error en pedido, etc."
              />
            </Field>
          )}

          {/* Resumen */}
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal del pedido</span>
              <span className="tabular-nums">{formatGs(base)}</span>
            </div>
            <div className="flex justify-between font-medium text-red-700 dark:text-red-400">
              <span>Descuento</span>
              <span className="tabular-nums">−{formatGs(previewMonto)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t pt-2">
              <span className="text-base font-bold">Total</span>
              <span className="text-xl font-bold tabular-nums">{formatGs(totalConDescuento)}</span>
            </div>
          </div>

          {motivoActual?.requiereAutorizacion && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Este motivo siempre requiere autorización de supervisor o código, aunque el
                porcentaje esté dentro de tu límite.
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t bg-muted/20 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={aplicar.isPending}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              void handleAplicar();
            }}
            disabled={aplicar.isPending || motivos.length === 0}
            className="flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {aplicar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Percent className="h-4 w-4" />
            )}
            Aplicar descuento
          </button>
        </div>
      </div>

      {/* Modal de escalado: aparece cuando el backend devuelve 403 */}
      {escalado && (
        <EscaladoModal
          mensaje={escalado.errorMsg}
          onCancel={() => setEscalado(null)}
          onSubmit={(auth) => {
            setEscalado(null);
            void aplicarConPayload({ ...escalado.payloadBase, ...auth });
          }}
        />
      )}
    </div>
  );
}

interface EscaladoState {
  payloadBase: AplicarDescuentoInput;
  errorMsg: string;
}

function EscaladoModal({
  mensaje,
  onCancel,
  onSubmit,
}: {
  mensaje: string;
  onCancel: () => void;
  onSubmit: (
    auth: { supervisorAuth: { email: string; password: string } } | { codigoAutorizacion: string },
  ) => void;
}) {
  const [tab, setTab] = useState<'SUPERVISOR' | 'CODIGO'>('SUPERVISOR');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigo, setCodigo] = useState('');
  const verificar = useVerificarSupervisor();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tab === 'SUPERVISOR') {
      if (!email.trim() || !password) {
        toast.error('Completá email y contraseña');
        return;
      }
      // Pre-validamos para dar feedback inmediato si las credenciales no sirven.
      try {
        await verificar.mutateAsync({ email: email.trim(), password });
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Credenciales inválidas');
        return;
      }
      onSubmit({ supervisorAuth: { email: email.trim(), password } });
    } else {
      const c = codigo.trim();
      if (!c) {
        toast.error('Ingresá el código');
        return;
      }
      onSubmit({ codigoAutorizacion: c });
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="flex items-center gap-2 font-bold">
            <ShieldAlert className="h-4 w-4 text-amber-600" /> Autorización requerida
          </h3>
          <button type="button" onClick={onCancel} className="rounded-sm p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4 p-4"
        >
          <p className="text-sm text-muted-foreground">{mensaje}</p>

          <div className="inline-flex w-full overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() => setTab('SUPERVISOR')}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                tab === 'SUPERVISOR'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-accent',
              )}
            >
              Credenciales del supervisor
            </button>
            <button
              type="button"
              onClick={() => setTab('CODIGO')}
              className={cn(
                'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                tab === 'CODIGO'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-accent',
              )}
            >
              Código de autorización
            </button>
          </div>

          {tab === 'SUPERVISOR' ? (
            <>
              <Field label="Email del supervisor">
                <Input
                  autoFocus
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="gerente@empresa.com.py"
                />
              </Field>
              <Field label="Contraseña">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
            </>
          ) : (
            <Field label="Código (8 dígitos)" hint="Te lo da el gerente o admin">
              <Input
                autoFocus
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="12345678"
                maxLength={32}
                className="font-mono"
              />
            </Field>
          )}

          <div className="flex justify-end gap-2 border-t pt-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={verificar.isPending}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {verificar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
              Autorizar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TipoBtn({
  active,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 rounded-md border p-2.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
          : 'border-input hover:bg-accent',
      )}
    >
      {icon}
      <span className="text-sm font-bold">{label}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{hint}</span>
    </button>
  );
}

// Re-uso de `MotivoDescuento` para que el bundler no avise sobre unused import
// si el tipo no se referencia (lo mantengo importado por claridad de la API).
export type { MotivoDescuento };
