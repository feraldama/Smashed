'use client';

import { Loader2, Pencil, Plus, Save, Tags, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { toast } from '@/components/Toast';
import {
  type Categoria,
  useActualizarCategoria,
  useCategorias,
  useCrearCategoria,
  useEliminarCategoria,
} from '@/hooks/useCatalogo';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const CATEGORIA_BASE_OPTIONS = [
  'HAMBURGUESA',
  'LOMITO',
  'PIZZA',
  'EMPANADA',
  'MILANESA',
  'CHIPA',
  'ENTRADA',
  'ACOMPANAMIENTO',
  'POSTRE',
  'BEBIDA_FRIA',
  'BEBIDA_CALIENTE',
  'CERVEZA',
  'COMBO',
  'OTRO',
];

export default function CategoriasPage() {
  return (
    <AuthGate>
      <AdminShell>
        <CategoriasScreen />
      </AdminShell>
    </AuthGate>
  );
}

function CategoriasScreen() {
  const { data: categorias = [], isLoading } = useCategorias();
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorías</h1>
          <p className="text-sm text-muted-foreground">
            Organizá el menú agrupando productos por categoría.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditingId('NEW')}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nueva categoría
        </button>
      </header>

      {editingId === 'NEW' && <CategoriaFormCard onClose={() => setEditingId(null)} />}

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : categorias.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <Tags className="mx-auto mb-2 h-8 w-8 opacity-30" />
          No hay categorías. Creá la primera para empezar.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Nombre</th>
                <th className="px-4 py-2 text-left">Tipo base</th>
                <th className="px-4 py-2 text-right">Orden</th>
                <th className="px-4 py-2 text-right">Productos</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {categorias.map((c) => (
                <CategoriaRow
                  key={c.id}
                  categoria={c}
                  isEditing={editingId === c.id}
                  onEdit={() => setEditingId(c.id)}
                  onCancelEdit={() => setEditingId(null)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CategoriaRow({
  categoria: c,
  isEditing,
  onEdit,
  onCancelEdit,
}: {
  categoria: Categoria;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
}) {
  const eliminar = useEliminarCategoria();

  if (isEditing) {
    return (
      <tr className="bg-primary/5">
        <td colSpan={5} className="p-4">
          <CategoriaFormCard categoria={c} onClose={onCancelEdit} />
        </td>
      </tr>
    );
  }

  async function handleEliminar() {
    if (!confirm(`Eliminar la categoría "${c.nombre}"?`)) return;
    try {
      await eliminar.mutateAsync(c.id);
      toast.success(`"${c.nombre}" eliminada`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Error al eliminar';
      toast.error(msg);
    }
  }

  return (
    <tr className="hover:bg-muted/20">
      <td className="px-4 py-2.5 font-medium">{c.nombre}</td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{c.categoriaBase}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{c.ordenMenu}</td>
      <td className="px-4 py-2.5 text-right">
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{c.totalProductos}</span>
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              void handleEliminar();
            }}
            disabled={eliminar.isPending}
            className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
            aria-label="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function CategoriaFormCard({ categoria, onClose }: { categoria?: Categoria; onClose: () => void }) {
  const crear = useCrearCategoria();
  const actualizar = useActualizarCategoria();
  const isPending = crear.isPending || actualizar.isPending;

  const [nombre, setNombre] = useState(categoria?.nombre ?? '');
  const [categoriaBase, setCategoriaBase] = useState(categoria?.categoriaBase ?? 'OTRO');
  const [ordenMenu, setOrdenMenu] = useState(String(categoria?.ordenMenu ?? 0));
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError('El nombre es requerido');
      return;
    }
    const orden = Number.parseInt(ordenMenu, 10) || 0;
    try {
      if (categoria) {
        await actualizar.mutateAsync({
          id: categoria.id,
          nombre: nombre.trim(),
          categoriaBase,
          ordenMenu: orden,
        });
        toast.success(`"${nombre}" actualizada`);
      } else {
        await crear.mutateAsync({ nombre: nombre.trim(), categoriaBase, ordenMenu: orden });
        toast.success(`"${nombre}" creada`);
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar');
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="grid gap-3 rounded-md border bg-card p-3 sm:grid-cols-[1fr,200px,100px,auto]"
    >
      <div>
        <label className="text-xs font-medium text-muted-foreground">Nombre</label>
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          placeholder="Hamburguesas"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Tipo base</label>
        <select
          value={categoriaBase}
          onChange={(e) => setCategoriaBase(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        >
          {CATEGORIA_BASE_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Orden</label>
        <input
          type="number"
          value={ordenMenu}
          onChange={(e) => setOrdenMenu(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          min={0}
        />
      </div>
      <div className="flex items-end gap-1">
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            'flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground',
            'hover:bg-primary/90 disabled:opacity-60',
          )}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Guardar
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-input p-1.5 hover:bg-accent"
          aria-label="Cancelar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && <p className="col-span-full text-xs text-destructive">{error}</p>}
    </form>
  );
}
