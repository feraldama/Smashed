'use client';

import { Info, Loader2, Lock, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { toast } from '@/components/Toast';
import {
  type MatrizMenuRol,
  useGuardarMatriz,
  useMatrizMenuRol,
  useResetearMatriz,
} from '@/hooks/useMenuRol';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const ROL_LABEL: Record<string, string> = {
  ADMIN_EMPRESA: 'Admin',
  GERENTE_SUCURSAL: 'Gerente',
  CAJERO: 'Cajero',
  COCINA: 'Cocina',
  MESERO: 'Mesero',
  REPARTIDOR: 'Repartidor',
};

export default function PermisosPage() {
  return (
    <AuthGate>
      <AdminShell>
        <PermisosScreen />
      </AdminShell>
    </AuthGate>
  );
}

function PermisosScreen() {
  const { data, isLoading, isError } = useMatrizMenuRol();
  const guardar = useGuardarMatriz();
  const resetear = useResetearMatriz();

  // Estado local: replica `asignaciones` del server, mutable.
  // Set de "rol|path" para lookup rápido y actualizaciones eficientes.
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [originalSnapshot, setOriginalSnapshot] = useState<string>(''); // para detectar dirty

  // Cargar el draft inicial cuando llegan los datos.
  useEffect(() => {
    if (!data) return;
    const s = new Set<string>();
    for (const [rol, paths] of Object.entries(data.asignaciones)) {
      if (rol === 'SUPER_ADMIN') continue;
      for (const p of paths) s.add(`${rol}|${p}`);
    }
    setDraft(s);
    setOriginalSnapshot(JSON.stringify([...s].sort()));
  }, [data]);

  const dirty = useMemo(
    () => JSON.stringify([...draft].sort()) !== originalSnapshot,
    [draft, originalSnapshot],
  );

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        No se pudo cargar la matriz de permisos.
      </div>
    );
  }

  // Agrupar menús por sección preservando orden del catálogo.
  const grupos = data.menus.reduce<Record<string, MatrizMenuRol['menus']>>((acc, m) => {
    (acc[m.grupo] ??= []).push(m);
    return acc;
  }, {});

  function toggle(rol: string, path: string) {
    const key = `${rol}|${path}`;
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function bloqueoRazon(menu: MatrizMenuRol['menus'][number], rol: string): string | null {
    const lock = menu.bloqueado.find((b) => b.rol === rol);
    return lock?.razon ?? null;
  }

  async function handleGuardar() {
    if (!data) return;
    // Reconstruir el dict { rol: paths[] }
    const asignaciones: Record<string, string[]> = {};
    for (const rol of data.rolesConfigurables) asignaciones[rol] = [];
    for (const key of draft) {
      const [rol, path] = key.split('|');
      if (rol && path && asignaciones[rol]) asignaciones[rol].push(path);
    }
    try {
      await guardar.mutateAsync(asignaciones);
      toast.success('Permisos guardados — el efecto se ve cuando los usuarios re-logueen');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al guardar');
    }
  }

  async function handleReset() {
    if (
      !confirm(
        '¿Restaurar la matriz a los valores por defecto? Se perderá la configuración personalizada.',
      )
    ) {
      return;
    }
    try {
      await resetear.mutateAsync();
      toast.success('Matriz restaurada a los defaults');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al restaurar');
    }
  }

  const isPending = guardar.isPending || resetear.isPending;

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Permisos por rol
          </h1>
          <p className="text-sm text-muted-foreground">
            Configurá qué menús ve cada rol en esta empresa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void handleReset();
            }}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            title="Volver a los valores por defecto"
          >
            <RotateCcw className="h-4 w-4" /> Restaurar defaults
          </button>
          <button
            type="button"
            onClick={() => {
              void handleGuardar();
            }}
            disabled={!dirty || isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
          >
            {guardar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar cambios
          </button>
        </div>
      </header>

      <div className="mb-4 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p>
            <strong>SUPER_ADMIN</strong> siempre ve todo y no se puede modificar desde acá. Algunas
            celdas con <Lock className="inline h-3 w-3" /> están bloqueadas porque sin ese menú el
            rol no puede operar (ej: <code>/pos</code> para Cajero).
          </p>
          <p className="mt-1 text-xs opacity-80">
            Los cambios surten efecto cuando el usuario afectado vuelve a iniciar sesión.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Menú
              </th>
              {data.rolesConfigurables.map((rol) => (
                <th
                  key={rol}
                  className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {ROL_LABEL[rol] ?? rol}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {Object.entries(grupos).map(([grupo, items]) => (
              <GrupoRows
                key={grupo}
                grupo={grupo}
                items={items}
                roles={data.rolesConfigurables}
                draft={draft}
                onToggle={toggle}
                getLock={bloqueoRazon}
              />
            ))}
          </tbody>
        </table>
      </div>

      {dirty && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
          Tenés cambios sin guardar.
        </p>
      )}
    </div>
  );
}

function GrupoRows({
  grupo,
  items,
  roles,
  draft,
  onToggle,
  getLock,
}: {
  grupo: string;
  items: MatrizMenuRol['menus'];
  roles: string[];
  draft: Set<string>;
  onToggle: (rol: string, path: string) => void;
  getLock: (menu: MatrizMenuRol['menus'][number], rol: string) => string | null;
}) {
  return (
    <>
      <tr className="bg-muted/20">
        <td
          colSpan={roles.length + 1}
          className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {grupo}
        </td>
      </tr>
      {items.map((menu) => (
        <tr key={menu.path} className="hover:bg-accent/30">
          <td className="px-3 py-2">
            <p className="font-medium">{menu.label}</p>
            <p className="font-mono text-[10px] text-muted-foreground">{menu.path}</p>
          </td>
          {roles.map((rol) => {
            const key = `${rol}|${menu.path}`;
            const checked = draft.has(key);
            const lockRazon = getLock(menu, rol);
            const locked = lockRazon !== null;
            return (
              <td key={rol} className="px-3 py-2 text-center">
                <label
                  className={cn(
                    'inline-flex items-center justify-center',
                    locked ? 'cursor-not-allowed' : 'cursor-pointer',
                  )}
                  title={locked ? `Bloqueado: ${lockRazon}` : undefined}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={() => onToggle(rol, menu.path)}
                    className="h-4 w-4 cursor-pointer rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {locked && <Lock className="ml-1 h-3 w-3 text-muted-foreground" />}
                </label>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
