'use client';

import { Loader2, Save, X } from 'lucide-react';
import { useState } from 'react';

import { toast } from '@/components/Toast';
import { Field, Input } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import {
  type Sucursal,
  type TipoRecargoDelivery,
  useActualizarSucursal,
  useCrearSucursal,
} from '@/hooks/useSucursales';
import { ApiError } from '@/lib/api';
import { cn, formatGs } from '@/lib/utils';

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
  // Depósito: sólo inventario. No vende, no factura, no requiere establecimiento.
  const [esDeposito, setEsDeposito] = useState(sucursal?.esDeposito ?? false);

  // Recargo delivery (admin-only — el cajero ve el monto auto-aplicado, no edita).
  const [recargoActivo, setRecargoActivo] = useState(sucursal?.deliveryRecargoActivo ?? false);
  const [recargoTipo, setRecargoTipo] = useState<TipoRecargoDelivery>(
    sucursal?.deliveryRecargoTipo ?? 'MONTO',
  );
  // Para PORCENTAJE guardamos el valor "humano" (15 = 15%) y al enviar
  // multiplicamos por 100 para llegar a los centésimos del 1% que espera el
  // backend (10000 = 100%). Para MONTO el valor son Gs. directos.
  const recargoValorInicial = sucursal
    ? sucursal.deliveryRecargoTipo === 'PORCENTAJE'
      ? Number.parseInt(sucursal.deliveryRecargoValor, 10) / 100
      : Number.parseInt(sucursal.deliveryRecargoValor, 10)
    : 0;
  const [recargoValor, setRecargoValor] = useState(String(recargoValorInicial));

  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) return setError('Nombre requerido');
    if (!codigo.trim()) return setError('Código requerido');
    // El establecimiento SIFEN sólo aplica a sucursales que venden.
    if (!esDeposito && !/^\d{3}$/.test(establecimiento)) {
      return setError('Establecimiento debe ser exactamente 3 dígitos');
    }
    if (direccion.trim().length < 3) return setError('Dirección requerida');

    // Recargo: validar y normalizar al formato wire del backend.
    let recargoValorWire = 0;
    if (recargoActivo) {
      const v = Number.parseFloat(recargoValor.replace(',', '.'));
      if (!Number.isFinite(v) || v < 0) return setError('Valor de recargo inválido');
      if (recargoTipo === 'PORCENTAJE') {
        if (v > 100) return setError('El porcentaje no puede superar 100%');
        recargoValorWire = Math.round(v * 100); // 15% → 1500 centésimos
      } else {
        if (v > 10_000_000) return setError('Monto excesivo');
        recargoValorWire = Math.round(v);
      }
    }

    try {
      if (sucursal) {
        await actualizar.mutateAsync({
          id: sucursal.id,
          nombre: nombre.trim(),
          codigo: codigo.trim().toUpperCase(),
          esDeposito,
          establecimiento: esDeposito ? null : establecimiento,
          direccion: direccion.trim(),
          ciudad: ciudad.trim() || null,
          departamento: departamento.trim() || null,
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          zonaHoraria: zonaHoraria.trim(),
          activa,
          deliveryRecargoActivo: recargoActivo,
          deliveryRecargoTipo: recargoTipo,
          deliveryRecargoValor: recargoValorWire,
        });
        toast.success('Sucursal actualizada');
      } else {
        await crear.mutateAsync({
          nombre: nombre.trim(),
          codigo: codigo.trim().toUpperCase(),
          esDeposito,
          establecimiento: esDeposito ? undefined : establecimiento,
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
            <SwitchField
              label="Depósito (solo inventario)"
              description="No vende ni factura: guarda insumos y los transfiere a las sucursales. No aparece en POS ni caja y no necesita establecimiento SIFEN."
              checked={esDeposito}
              onCheckedChange={setEsDeposito}
            />

            <div
              className={cn(
                'grid gap-3',
                esDeposito ? 'sm:grid-cols-[1fr_140px]' : 'sm:grid-cols-[1fr_140px_120px]',
              )}
            >
              <Field label="Nombre" required>
                <Input
                  autoFocus
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder={esDeposito ? 'Depósito Central' : 'Asunción Centro'}
                />
              </Field>
              <Field label="Código interno" required hint="ej: CEN, DEP">
                <Input
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                  className="font-mono"
                  placeholder={esDeposito ? 'DEP' : 'CEN'}
                  maxLength={20}
                />
              </Field>
              {!esDeposito && (
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
              )}
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

            {isEdit && !esDeposito && (
              <div className="rounded-md border bg-muted/10 p-4">
                <h3 className="mb-1 text-sm font-bold">Recargo delivery</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Monto que se suma automáticamente a cada pedido de delivery propio. El cajero no
                  lo puede modificar. Clientes con "Sin recargo delivery" quedan exentos.
                </p>
                <SwitchField
                  label="Aplicar recargo en delivery"
                  description="Si está apagado, los pedidos de delivery no suman nada extra"
                  checked={recargoActivo}
                  onCheckedChange={setRecargoActivo}
                />
                {recargoActivo && (
                  <div className="mt-3 space-y-3">
                    <Field label="Tipo de recargo">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setRecargoTipo('MONTO')}
                          className={cn(
                            'rounded-md border p-2 text-xs font-medium transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            recargoTipo === 'MONTO'
                              ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                              : 'border-input hover:bg-accent',
                          )}
                        >
                          Monto fijo (Gs.)
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecargoTipo('PORCENTAJE')}
                          className={cn(
                            'rounded-md border p-2 text-xs font-medium transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            recargoTipo === 'PORCENTAJE'
                              ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                              : 'border-input hover:bg-accent',
                          )}
                        >
                          Porcentaje (%)
                        </button>
                      </div>
                    </Field>
                    <Field
                      label={recargoTipo === 'MONTO' ? 'Monto (Gs.)' : 'Porcentaje (%)'}
                      hint={
                        recargoTipo === 'MONTO'
                          ? 'Se suma este monto a cada pedido de delivery'
                          : 'Se aplica este % sobre el total del pedido (ej: 15 = 15%)'
                      }
                    >
                      <Input
                        type="number"
                        value={recargoValor}
                        onChange={(e) => setRecargoValor(e.target.value)}
                        min={0}
                        max={recargoTipo === 'PORCENTAJE' ? 100 : 10_000_000}
                        step={recargoTipo === 'PORCENTAJE' ? '0.01' : '500'}
                        placeholder={recargoTipo === 'MONTO' ? '8000' : '15'}
                      />
                    </Field>
                    {(() => {
                      const v = Number.parseFloat(recargoValor.replace(',', '.'));
                      if (!Number.isFinite(v) || v <= 0) return null;
                      const ejemploTicket = 50_000;
                      const ejemploRecargo =
                        recargoTipo === 'MONTO' ? v : Math.floor((ejemploTicket * v) / 100);
                      return (
                        <p className="text-xs text-muted-foreground">
                          Ejemplo: un pedido de {formatGs(ejemploTicket)} cobraría{' '}
                          <strong className="text-foreground">+{formatGs(ejemploRecargo)}</strong>{' '}
                          {recargoTipo === 'PORCENTAJE'
                            ? `(${v}% del total)`
                            : '(siempre el mismo monto)'}
                          .
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>
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
