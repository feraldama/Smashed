'use client';

import {
  CheckCircle2,
  Key,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { ResetPasswordModal } from '@/components/ResetPasswordModal';
import { confirmar, toast } from '@/components/Toast';
import { Input, Select } from '@/components/ui/Input';
import { UsuarioFormModal } from '@/components/UsuarioFormModal';
import {
  ROLES_DISPONIBLES,
  type Rol,
  type Usuario,
  useEliminarUsuario,
  useUsuarios,
} from '@/hooks/useUsuarios';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function UsuariosPage() {
  return (
    <AuthGate>
      <AdminShell>
        <UsuariosScreen />
      </AdminShell>
    </AuthGate>
  );
}

function UsuariosScreen() {
  const me = useAuthStore((s) => s.user);
  const [busqueda, setBusqueda] = useState('');
  const [rolFiltro, setRolFiltro] = useState<Rol | ''>('');
  const [incluirInactivos, setIncluirInactivos] = useState(false);

  const { data: usuarios = [], isLoading } = useUsuarios({
    busqueda: busqueda.trim() || undefined,
    rol: rolFiltro || undefined,
    incluirInactivos,
  });

  const [editando, setEditando] = useState<Usuario | 'NEW' | null>(null);
  const [reseteando, setReseteando] = useState<Usuario | null>(null);
  const eliminar = useEliminarUsuario();

  async function handleEliminar(u: Usuario) {
    if (u.id === me?.id) {
      toast.error('No podés eliminar tu propio usuario');
      return;
    }
    const ok = await confirmar({
      titulo: 'Eliminar usuario',
      mensaje: `¿Eliminar a ${u.nombreCompleto}? Esto cierra sus sesiones y le bloquea el login.`,
      destructivo: true,
      textoConfirmar: 'Eliminar',
    });
    if (!ok) return;
    try {
      await eliminar.mutateAsync(u.id);
      toast.success(`${u.nombreCompleto} eliminado`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al eliminar');
    }
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <UserCog className="h-6 w-6 text-primary" />
            Usuarios
          </h1>
          <p className="text-sm text-muted-foreground">
            {usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''}
            {incluirInactivos ? ' (incluyendo inactivos)' : ' activos'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditando('NEW')}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" /> Nuevo usuario
        </button>
      </header>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o email..."
            className="pl-9 pr-9"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select
          value={rolFiltro}
          onChange={(e) => setRolFiltro(e.target.value as Rol | '')}
          className="w-auto"
        >
          <option value="">Todos los roles</option>
          {ROLES_DISPONIBLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={incluirInactivos}
            onChange={(e) => setIncluirInactivos(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="text-xs">Incluir inactivos</span>
        </label>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : usuarios.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 h-8 w-8 opacity-30" />
          {busqueda || rolFiltro ? 'No hay coincidencias' : 'Sin usuarios'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Usuario</th>
                <th className="px-4 py-2 text-left">Rol</th>
                <th className="px-4 py-2 text-left">Sucursales</th>
                <th className="px-4 py-2 text-left">Último login</th>
                <th className="px-4 py-2 text-center">Estado</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {usuarios.map((u) => (
                <UsuarioRow
                  key={u.id}
                  usuario={u}
                  isMe={u.id === me?.id}
                  onEdit={() => setEditando(u)}
                  onResetPassword={() => setReseteando(u)}
                  onDelete={() => {
                    void handleEliminar(u);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modales */}
      {editando && (
        <UsuarioFormModal
          usuario={editando === 'NEW' ? undefined : editando}
          onClose={() => setEditando(null)}
        />
      )}
      {reseteando && (
        <ResetPasswordModal usuario={reseteando} onClose={() => setReseteando(null)} />
      )}
    </div>
  );
}

function UsuarioRow({
  usuario,
  isMe,
  onEdit,
  onResetPassword,
  onDelete,
}: {
  usuario: Usuario;
  isMe: boolean;
  onEdit: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rolLabel = ROLES_DISPONIBLES.find((r) => r.value === usuario.rol)?.label ?? usuario.rol;
  const principal = usuario.sucursales.find((s) => s.esPrincipal);
  const otras = usuario.sucursales.filter((s) => !s.esPrincipal);

  return (
    <tr className={cn('hover:bg-muted/20', !usuario.activo && 'opacity-60')}>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
            {usuario.nombreCompleto
              .split(' ')
              .slice(0, 2)
              .map((p) => p[0])
              .join('')
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {usuario.nombreCompleto}
              {isMe && (
                <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                  vos
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            usuario.rol === 'SUPER_ADMIN' &&
              'bg-violet-100 text-violet-900 dark:bg-violet-950/40 dark:text-violet-200',
            usuario.rol === 'ADMIN_EMPRESA' && 'bg-primary/15 text-primary',
            usuario.rol === 'GERENTE_SUCURSAL' &&
              'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
            (usuario.rol === 'CAJERO' ||
              usuario.rol === 'COCINA' ||
              usuario.rol === 'MESERO' ||
              usuario.rol === 'REPARTIDOR') &&
              'bg-muted text-muted-foreground',
          )}
        >
          {rolLabel}
        </span>
      </td>
      <td className="px-4 py-2.5">
        {usuario.sucursales.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="text-xs">
            {principal && (
              <p>
                <span className="text-amber-600">★</span> {principal.sucursal.nombre}
              </p>
            )}
            {otras.length > 0 && (
              <p className="text-muted-foreground">
                {otras.map((s) => s.sucursal.nombre).join(', ')}
              </p>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">
        {usuario.ultimoLogin
          ? new Date(usuario.ultimoLogin).toLocaleString('es-PY', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Nunca'}
      </td>
      <td className="px-4 py-2.5 text-center">
        {usuario.activo ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <CheckCircle2 className="h-3 w-3" /> Activo
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
            Inactivo
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="relative inline-block">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Acciones"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
              />
              <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border bg-card shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onResetPassword();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <Key className="h-3.5 w-3.5" /> Resetear password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  disabled={isMe}
                  className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </button>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
