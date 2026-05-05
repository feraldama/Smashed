'use client';

import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Power,
  PowerOff,
  Search,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { EmpresaActivaModal } from '@/components/EmpresaActivaModal';
import { EmpresaAdminFormModal } from '@/components/EmpresaAdminFormModal';
import { toast } from '@/components/Toast';
import { Input } from '@/components/ui/Input';
import {
  type AdminEmpresa,
  useAdminEmpresas,
  useOperarComoEmpresa,
} from '@/hooks/useAdminEmpresas';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function AdminEmpresasPage() {
  return (
    <AuthGate roles={['SUPER_ADMIN']}>
      <AdminShell>
        <AdminEmpresasScreen />
      </AdminShell>
    </AuthGate>
  );
}

type FiltroActiva = 'todas' | 'activas' | 'inactivas';

function AdminEmpresasScreen() {
  const router = useRouter();
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const setEmpresaOperando = useAuthStore((s) => s.setEmpresaOperando);
  const setSucursalActiva = useAuthStore((s) => s.setSucursalActiva);
  const operar = useOperarComoEmpresa();

  const [q, setQ] = useState('');
  const [filtroActiva, setFiltroActiva] = useState<FiltroActiva>('todas');
  const [creando, setCreando] = useState(false);
  const [toggling, setToggling] = useState<AdminEmpresa | null>(null);

  const { data, isLoading } = useAdminEmpresas({
    q: q.trim() || undefined,
    activa: filtroActiva === 'activas' ? true : filtroActiva === 'inactivas' ? false : undefined,
    pageSize: 100,
  });

  const empresas = data?.items ?? [];
  const total = data?.total ?? 0;
  const inactivas = empresas.filter((e) => !e.activa).length;

  async function entrarComo(empresa: AdminEmpresa) {
    if (!empresa.activa) {
      toast.warn('La empresa está suspendida. Reactivala antes de operar.');
      return;
    }
    try {
      const r = await operar.mutateAsync(empresa.id);
      setAccessToken(r.accessToken);
      setSucursalActiva(r.sucursalActivaId);
      setEmpresaOperando(r.empresa);
      toast.success(`Operando como ${r.empresa.nombreFantasia}`);
      router.push('/');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo entrar al modo operar');
    }
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Building2 className="h-6 w-6 text-primary" />
            Empresas (super-admin)
          </h1>
          <p className="text-sm text-muted-foreground">
            {total} empresa{total !== 1 ? 's' : ''} · <strong>{inactivas}</strong> suspendida
            {inactivas !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nueva empresa
        </button>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[260px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por razón social, fantasía o RUC"
            className="pl-9"
          />
        </div>
        <div className="flex rounded-md border bg-card p-0.5 text-sm">
          {(['todas', 'activas', 'inactivas'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltroActiva(f)}
              className={cn(
                'rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                filtroActiva === f
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : empresas.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <Building2 className="mx-auto mb-2 h-8 w-8 opacity-30" />
          {q || filtroActiva !== 'todas'
            ? 'Ninguna empresa coincide con los filtros.'
            : 'Sin empresas. Creá la primera.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-semibold">Empresa</th>
                <th className="px-4 py-2 font-semibold">RUC</th>
                <th className="px-4 py-2 text-center font-semibold">Sucursales</th>
                <th className="px-4 py-2 text-center font-semibold">Usuarios</th>
                <th className="px-4 py-2 font-semibold">Estado</th>
                <th className="px-4 py-2 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold">{e.nombreFantasia}</p>
                    <p className="truncate text-xs text-muted-foreground">{e.razonSocial}</p>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {e.ruc}-{e.dv}
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono">{e._count.sucursales}</td>
                  <td className="px-4 py-2.5 text-center font-mono">{e._count.usuarios}</td>
                  <td className="px-4 py-2.5">
                    <EstadoBadge empresa={e} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          void entrarComo(e);
                        }}
                        disabled={!e.activa || operar.isPending}
                        title={
                          e.activa
                            ? 'Operar como esta empresa'
                            : 'Empresa suspendida — reactivala para operar'
                        }
                        className="inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Operar
                      </button>
                      <button
                        type="button"
                        onClick={() => setToggling(e)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                          e.activa
                            ? 'border-destructive/30 text-destructive hover:bg-destructive/10'
                            : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30',
                        )}
                      >
                        {e.activa ? (
                          <>
                            <PowerOff className="h-3.5 w-3.5" /> Suspender
                          </>
                        ) : (
                          <>
                            <Power className="h-3.5 w-3.5" /> Reactivar
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creando && <EmpresaAdminFormModal onClose={() => setCreando(false)} />}
      {toggling && <EmpresaActivaModal empresa={toggling} onClose={() => setToggling(null)} />}
    </div>
  );
}

function EstadoBadge({ empresa }: { empresa: AdminEmpresa }) {
  if (empresa.activa) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> Activa
      </span>
    );
  }
  return (
    <div>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive">
        <XCircle className="h-3.5 w-3.5" /> Suspendida
      </span>
      {empresa.motivoInactiva && (
        <p className="mt-0.5 text-[11px] text-muted-foreground" title={empresa.motivoInactiva}>
          {empresa.motivoInactiva.length > 40
            ? `${empresa.motivoInactiva.slice(0, 40)}…`
            : empresa.motivoInactiva}
        </p>
      )}
    </div>
  );
}
