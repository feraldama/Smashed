'use client';

import {
  Calendar,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Percent,
  Plus,
  Save,
  ShieldCheck,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { confirmar, toast } from '@/components/Toast';
import { Field, Input } from '@/components/ui/Input';
import { SwitchField } from '@/components/ui/Switch';
import {
  type CodigoAutorizacionDescuento,
  type FiltroCodigos,
  type LimiteInput,
  type MotivoDescuento,
  type MotivoInput,
  useActualizarLimites,
  useActualizarMotivo,
  useCodigosDescuento,
  useCrearCodigo,
  useCrearMotivo,
  useEliminarCodigo,
  useEliminarMotivo,
  useLimitesDescuento,
  useMotivosDescuento,
} from '@/hooks/useDescuento';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

type Tab = 'motivos' | 'limites' | 'codigos';

const ROLES_CONFIGURABLES = [
  'ADMIN_EMPRESA',
  'GERENTE_SUCURSAL',
  'CAJERO',
  'MESERO',
  'COCINA',
  'REPARTIDOR',
] as const;

const ROL_LABELS: Record<(typeof ROLES_CONFIGURABLES)[number], string> = {
  ADMIN_EMPRESA: 'Admin empresa',
  GERENTE_SUCURSAL: 'Gerente sucursal',
  CAJERO: 'Cajero',
  MESERO: 'Mesero',
  COCINA: 'Cocina',
  REPARTIDOR: 'Repartidor',
};

export default function DescuentosPage() {
  return (
    <AuthGate>
      <AdminShell>
        <DescuentosScreen />
      </AdminShell>
    </AuthGate>
  );
}

function DescuentosScreen() {
  const [tab, setTab] = useState<Tab>('motivos');

  return (
    <div>
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Percent className="h-6 w-6 text-primary" /> Descuentos
        </h1>
        <p className="text-sm text-muted-foreground">
          Configurá motivos, límites por rol y códigos de autorización que el cajero puede usar.
        </p>
      </header>

      <nav className="mb-4 flex flex-wrap gap-1 border-b">
        <TabBtn active={tab === 'motivos'} onClick={() => setTab('motivos')} icon={Tag}>
          Motivos
        </TabBtn>
        <TabBtn active={tab === 'limites'} onClick={() => setTab('limites')} icon={ShieldCheck}>
          Límites por rol
        </TabBtn>
        <TabBtn active={tab === 'codigos'} onClick={() => setTab('codigos')} icon={KeyRound}>
          Códigos
        </TabBtn>
      </nav>

      {tab === 'motivos' && <TabMotivos />}
      {tab === 'limites' && <TabLimites />}
      {tab === 'codigos' && <TabCodigos />}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Tab Motivos
// ═══════════════════════════════════════════════════════════════════════════

function TabMotivos() {
  const { data: motivos = [], isLoading } = useMotivosDescuento();
  const [editando, setEditando] = useState<MotivoDescuento | 'NEW' | null>(null);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {motivos.length} motivo{motivos.length !== 1 ? 's' : ''} activo
          {motivos.length !== 1 ? 's' : ''}. El cajero elige uno al aplicar un descuento.
        </p>
        <button
          type="button"
          onClick={() => setEditando('NEW')}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nuevo motivo
        </button>
      </div>

      {isLoading ? (
        <Cargando />
      ) : motivos.length === 0 ? (
        <Vacio mensaje='Todavía no hay motivos. Creá uno (ej: "Cliente frecuente", "Cumpleaños", "Cortesía gerencial").' />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {motivos.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-medium">
                  {m.nombre}
                  {m.esSistema && (
                    <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      Sistema
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.requiereAutorizacion
                    ? 'Siempre requiere autorización de supervisor/código'
                    : 'Permitido dentro del límite del rol'}
                </p>
              </div>
              <span className="font-mono text-xs text-muted-foreground">orden {m.ordenMenu}</span>
              <button
                type="button"
                onClick={() => setEditando(m)}
                className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editando && (
        <MotivoFormModal
          motivo={editando === 'NEW' ? undefined : editando}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function MotivoFormModal({ motivo, onClose }: { motivo?: MotivoDescuento; onClose: () => void }) {
  const crear = useCrearMotivo();
  const actualizar = useActualizarMotivo();
  const eliminar = useEliminarMotivo();
  const isPending = crear.isPending || actualizar.isPending || eliminar.isPending;
  const isEdit = Boolean(motivo);
  // Motivos del sistema (ej. "Descuento empleado"): el backend rechaza cambios
  // que no sean del campo `activo`. La UI bloquea los otros para no marear al usuario.
  const esSistema = motivo?.esSistema ?? false;

  const [nombre, setNombre] = useState(motivo?.nombre ?? '');
  const [requiereAutorizacion, setRequiereAutorizacion] = useState(
    motivo?.requiereAutorizacion ?? false,
  );
  const [activo, setActivo] = useState(motivo?.activo ?? true);
  const [ordenMenu, setOrdenMenu] = useState(String(motivo?.ordenMenu ?? 0));
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Motivo del sistema: solo mandamos `activo`. El backend rechaza otros campos.
    if (esSistema && motivo) {
      try {
        await actualizar.mutateAsync({ id: motivo.id, activo });
        toast.success('Motivo actualizado');
        onClose();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error al guardar');
      }
      return;
    }
    if (!nombre.trim()) return setError('Nombre requerido');
    const orden = Number.parseInt(ordenMenu, 10);
    if (!Number.isFinite(orden) || orden < 0) return setError('Orden inválido');
    const input: MotivoInput = {
      nombre: nombre.trim(),
      requiereAutorizacion,
      activo,
      ordenMenu: orden,
    };
    try {
      if (motivo) {
        await actualizar.mutateAsync({ id: motivo.id, ...input });
        toast.success('Motivo actualizado');
      } else {
        await crear.mutateAsync(input);
        toast.success('Motivo creado');
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar');
    }
  }

  async function handleEliminar() {
    if (!motivo) return;
    const ok = await confirmar({
      titulo: 'Eliminar motivo',
      mensaje: `¿Eliminar "${motivo.nombre}"? Los pedidos históricos que lo usan no se ven afectados.`,
      destructivo: true,
      textoConfirmar: 'Eliminar',
    });
    if (!ok) return;
    try {
      await eliminar.mutateAsync(motivo.id);
      toast.success('Motivo eliminado');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al eliminar');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">{isEdit ? 'Editar motivo' : 'Nuevo motivo'}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4 p-5"
        >
          {esSistema && (
            <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
              Motivo del sistema — solo se puede activar / desactivar. El nombre y resto de
              propiedades los gestiona la aplicación.
            </div>
          )}
          <Field label="Nombre" required hint="ej: Cliente frecuente, Cortesía gerencial">
            <Input
              autoFocus={!esSistema}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={100}
              disabled={esSistema}
            />
          </Field>
          <Field label="Orden" hint="Menor número aparece antes en el dropdown">
            <Input
              type="number"
              value={ordenMenu}
              onChange={(e) => setOrdenMenu(e.target.value)}
              min={0}
              max={9999}
              disabled={esSistema}
            />
          </Field>
          <SwitchField
            label="Requiere autorización siempre"
            description="Si está activado, este motivo SIEMPRE pide supervisor/código aunque el % esté dentro del límite del rol. Para motivos sensibles (cortesía gerencial, error grueso, etc)."
            checked={requiereAutorizacion}
            onCheckedChange={setRequiereAutorizacion}
            disabled={esSistema}
          />
          <SwitchField
            label="Activo"
            description="Si está apagado, no aparece en el dropdown del POS"
            checked={activo}
            onCheckedChange={setActivo}
          />
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}
          <div className="flex justify-between gap-2 border-t pt-3">
            {isEdit && !esSistema ? (
              <button
                type="button"
                onClick={() => {
                  void handleEliminar();
                }}
                disabled={isPending}
                className="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="inline h-3.5 w-3.5" /> Eliminar
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
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
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Tab Límites por rol
// ═══════════════════════════════════════════════════════════════════════════

function TabLimites() {
  const { data: limites = [], isLoading } = useLimitesDescuento();
  const actualizar = useActualizarLimites();
  // Estado local editable: empezamos con lo que vino del backend (o defaults
  // 0 si no existe la fila para el rol).
  const [draft, setDraft] = useState<Record<string, LimiteInput>>({});
  const [touched, setTouched] = useState(false);

  // Hidratar el draft cuando llegan los datos (solo si no se tocó nada).
  // useEffect (no useMemo) para no setear estado durante el render — el
  // fallback `data ?? []` crea un nuevo `[]` por render mientras data es
  // undefined, así que con useMemo se disparaba "Too many re-renders".
  useEffect(() => {
    if (touched) return;
    const inicial: Record<string, LimiteInput> = {};
    for (const rol of ROLES_CONFIGURABLES) {
      const existente = limites.find((l) => l.rol === rol);
      inicial[rol] = {
        rol,
        maxPorcentaje: existente?.maxPorcentaje ?? 0,
        puedeAutorizarOtros: existente?.puedeAutorizarOtros ?? false,
        puedeUsarCortesia: existente?.puedeUsarCortesia ?? false,
      };
    }
    setDraft(inicial);
  }, [limites, touched]);

  function patch(rol: string, p: Partial<LimiteInput>) {
    setTouched(true);
    setDraft((prev) => {
      const current = prev[rol];
      if (!current) return prev;
      return { ...prev, [rol]: { ...current, ...p } };
    });
  }

  async function handleGuardar() {
    try {
      await actualizar.mutateAsync({ limites: Object.values(draft) });
      setTouched(false);
      toast.success('Límites guardados');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al guardar');
    }
  }

  if (isLoading) return <Cargando />;

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Definí cuánto puede descontar cada rol por su cuenta. Si un cajero quiere dar más, el
        sistema le pide credenciales de un rol con &quot;puede autorizar&quot;, o un código.
      </p>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Máx. %</th>
              <th className="px-4 py-2">Puede autorizar</th>
              <th className="px-4 py-2">Puede cortesía</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {ROLES_CONFIGURABLES.map((rol) => {
              const d = draft[rol];
              if (!d) return null;
              return (
                <tr key={rol}>
                  <td className="px-4 py-2 font-medium">{ROL_LABELS[rol]}</td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={String(d.maxPorcentaje)}
                      onChange={(e) =>
                        patch(rol, {
                          maxPorcentaje: Math.max(
                            0,
                            Math.min(100, Number.parseInt(e.target.value, 10) || 0),
                          ),
                        })
                      }
                      className="w-20"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={d.puedeAutorizarOtros}
                      onChange={(e) => patch(rol, { puedeAutorizarOtros: e.target.checked })}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={d.puedeUsarCortesia}
                      onChange={(e) => patch(rol, { puedeUsarCortesia: e.target.checked })}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <strong>Máx %:</strong> 0 = no puede dar descuentos. 100 = sin tope.{' '}
          <strong>Puede autorizar:</strong> el rol funciona como supervisor para escalar descuentos
          de otros y puede generar códigos. <strong>Puede cortesía:</strong> el rol puede aplicar
          100% off.
        </p>
        <button
          type="button"
          onClick={() => {
            void handleGuardar();
          }}
          disabled={actualizar.isPending || !touched}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {actualizar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Guardar cambios
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Tab Códigos
// ═══════════════════════════════════════════════════════════════════════════

function TabCodigos() {
  const [filtro, setFiltro] = useState<FiltroCodigos>('ACTIVOS');
  const { data: codigos = [], isLoading } = useCodigosDescuento(filtro);
  const [showNuevo, setShowNuevo] = useState(false);
  const [codigoRecienCreado, setCodigoRecienCreado] = useState<CodigoAutorizacionDescuento | null>(
    null,
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex overflow-hidden rounded-md border">
          {(['ACTIVOS', 'USADOS', 'EXPIRADOS', 'TODOS'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors',
                filtro === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-accent',
              )}
            >
              {f === 'ACTIVOS'
                ? 'Activos'
                : f === 'USADOS'
                  ? 'Usados'
                  : f === 'EXPIRADOS'
                    ? 'Expirados'
                    : 'Todos'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowNuevo(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nuevo código
        </button>
      </div>

      {isLoading ? (
        <Cargando />
      ) : codigos.length === 0 ? (
        <Vacio
          mensaje={
            filtro === 'ACTIVOS'
              ? 'No hay códigos activos. Generá uno para que el cajero lo use cuando supere su límite.'
              : 'No hay códigos que coincidan con el filtro.'
          }
        />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {codigos.map((c) => (
            <CodigoRow key={c.id} codigo={c} />
          ))}
        </ul>
      )}

      {showNuevo && (
        <NuevoCodigoModal
          onClose={() => setShowNuevo(false)}
          onCreado={(c) => {
            setShowNuevo(false);
            setCodigoRecienCreado(c);
          }}
        />
      )}
      {codigoRecienCreado && (
        <CodigoCreadoModal
          codigo={codigoRecienCreado}
          onClose={() => setCodigoRecienCreado(null)}
        />
      )}
    </div>
  );
}

function CodigoRow({ codigo: c }: { codigo: CodigoAutorizacionDescuento }) {
  const eliminar = useEliminarCodigo();
  const ahora = new Date();
  const expira = new Date(c.expiraEn);
  const expirado = !c.usadoEn && expira < ahora;
  const usado = Boolean(c.usadoEn);
  const activo = !usado && !expirado;

  async function handleEliminar() {
    const ok = await confirmar({
      titulo: 'Eliminar código',
      mensaje: '¿Eliminar este código? Solo se pueden eliminar códigos no usados.',
      destructivo: true,
      textoConfirmar: 'Eliminar',
    });
    if (!ok) return;
    try {
      await eliminar.mutateAsync(c.id);
      toast.success('Código eliminado');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="font-mono text-lg font-bold tabular-nums">{c.codigo}</span>
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
          usado
            ? 'bg-muted text-muted-foreground'
            : expirado
              ? 'border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200'
              : 'border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200',
        )}
      >
        {usado ? 'Usado' : expirado ? 'Expirado' : 'Activo'}
      </span>
      <span className="text-sm font-medium">Hasta {c.maxPorcentaje}%</span>
      <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          <Calendar className="inline h-3 w-3" /> expira{' '}
          {expira.toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
        <span>creado por {c.creadoPor.nombreCompleto}</span>
        {activo && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(c.codigo);
              toast.success('Código copiado');
            }}
            className="rounded p-1 hover:bg-accent"
            title="Copiar código"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
        {!usado && (
          <button
            type="button"
            onClick={() => {
              void handleEliminar();
            }}
            className="rounded p-1 text-destructive hover:bg-destructive/10"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

function NuevoCodigoModal({
  onClose,
  onCreado,
}: {
  onClose: () => void;
  onCreado: (c: CodigoAutorizacionDescuento) => void;
}) {
  const crear = useCrearCodigo();
  const [maxPorcentaje, setMaxPorcentaje] = useState('20');
  const [expiraEnHoras, setExpiraEnHoras] = useState('24');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const pct = Number.parseInt(maxPorcentaje, 10);
    const hrs = Number.parseInt(expiraEnHoras, 10);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) return setError('Porcentaje 1-100');
    if (!Number.isFinite(hrs) || hrs < 1 || hrs > 168) return setError('Horas 1-168 (7 días)');
    try {
      const res = await crear.mutateAsync({ maxPorcentaje: pct, expiraEnHoras: hrs });
      onCreado(res.codigo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al crear');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">Generar código de autorización</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4 p-5"
        >
          <p className="text-xs text-muted-foreground">
            El código será válido para descuentos hasta el porcentaje indicado y caduca a las horas
            configuradas. Es de un solo uso. Después se lo pasás al cajero por WhatsApp o como
            prefieras.
          </p>
          <Field label="Tope de descuento (%)" required>
            <Input
              type="number"
              value={maxPorcentaje}
              onChange={(e) => setMaxPorcentaje(e.target.value)}
              min={1}
              max={100}
            />
          </Field>
          <Field label="Vigencia (horas)" required hint="Máximo 168 horas (7 días)">
            <Input
              type="number"
              value={expiraEnHoras}
              onChange={(e) => setExpiraEnHoras(e.target.value)}
              min={1}
              max={168}
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
              disabled={crear.isPending}
              className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
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
                <KeyRound className="h-4 w-4" />
              )}
              Generar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CodigoCreadoModal({
  codigo,
  onClose,
}: {
  codigo: CodigoAutorizacionDescuento;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b p-4 text-center">
          <KeyRound className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
          <h2 className="text-lg font-bold">Código generado</h2>
          <p className="text-xs text-muted-foreground">
            Pasalo al cajero. Es de un solo uso y vence a las{' '}
            {new Date(codigo.expiraEn).toLocaleString('es-PY', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
            .
          </p>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-md border-2 border-primary bg-primary/5 p-6 text-center">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Código</p>
            <p className="font-mono text-4xl font-bold tracking-wider tabular-nums">
              {codigo.codigo}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Válido para descuentos hasta <strong>{codigo.maxPorcentaje}%</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(codigo.codigo);
              toast.success('Código copiado al portapapeles');
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Copy className="h-4 w-4" /> Copiar código
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════

function Cargando() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function Vacio({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
      {mensaje}
    </div>
  );
}
