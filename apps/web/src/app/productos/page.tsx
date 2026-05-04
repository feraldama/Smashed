'use client';

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { confirmar, toast } from '@/components/Toast';
import {
  productoImagenSrc,
  useCategorias,
  useEliminarProducto,
  useProductosPaginados,
} from '@/hooks/useCatalogo';
import { ApiError } from '@/lib/api';
import { cn, formatGs } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const PAGE_SIZE_DEFAULT = 10;

export default function ProductosPage() {
  return (
    <AuthGate>
      <AdminShell>
        <ProductosScreen />
      </AdminShell>
    </AuthGate>
  );
}

function ProductosScreen() {
  const [busqueda, setBusqueda] = useState('');
  const [categoriaId, setCategoriaId] = useState<string | undefined>(undefined);
  const [incluirNoVendibles, setIncluirNoVendibles] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_DEFAULT);

  // Cualquier cambio de filtros nos lleva a la primera página — si no, podríamos
  // quedar fuera de rango (ej. página 5 cuando el filtro deja sólo 12 ítems).
  useEffect(() => {
    setPage(1);
  }, [busqueda, categoriaId, incluirNoVendibles, pageSize]);

  const { data: categorias = [] } = useCategorias();
  const { data, isLoading, isFetching } = useProductosPaginados({
    busqueda: busqueda.trim() || undefined,
    categoriaId,
    incluirNoVendibles,
    page,
    pageSize,
  });
  const productos = data?.productos ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);

  const eliminar = useEliminarProducto();

  async function handleEliminar(id: string, nombre: string) {
    const ok = await confirmar({
      titulo: 'Eliminar producto',
      mensaje: `¿Eliminar "${nombre}"? Quedará oculto pero el histórico se preserva.`,
      destructivo: true,
      textoConfirmar: 'Eliminar',
    });
    if (!ok) return;
    try {
      await eliminar.mutateAsync(id);
      toast.success(`"${nombre}" eliminado`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div>
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">
            {total} producto{total !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/productos/nuevo"
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nuevo
        </Link>
      </header>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, código o código de barras..."
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm"
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

        <select
          value={categoriaId ?? ''}
          onChange={(e) => setCategoriaId(e.target.value || undefined)}
          className="rounded-md border border-input bg-background px-2 py-2 text-sm"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-2 text-xs">
          <input
            type="checkbox"
            checked={incluirNoVendibles}
            onChange={(e) => setIncluirNoVendibles(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Mostrar no vendibles
        </label>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : productos.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <Utensils className="mx-auto mb-2 h-8 w-8 opacity-30" />
          No hay productos que coincidan con los filtros.
        </div>
      ) : (
        <div
          className={cn('overflow-hidden rounded-lg border bg-card', isFetching && 'opacity-60')}
        >
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-2"></th>
                <th className="px-4 py-2 text-left">Código</th>
                <th className="px-4 py-2 text-left">Nombre</th>
                <th className="px-4 py-2 text-left">Categoría</th>
                <th className="px-4 py-2 text-right">Precio</th>
                <th className="px-4 py-2 text-center">IVA</th>
                <th className="px-4 py-2 text-center">Estado</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {productos.map((p) => {
                const imgSrc = productoImagenSrc(p);
                return (
                  <tr key={p.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      {imgSrc ? (
                        <Image
                          src={imgSrc}
                          alt=""
                          width={32}
                          height={32}
                          unoptimized
                          className="h-8 w-8 rounded-md object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-md bg-muted" />
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px] text-muted-foreground">
                      {p.codigo ?? '—'}
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-medium">{p.nombre}</p>
                      {p.descripcion && (
                        <p className="line-clamp-1 text-[11px] text-muted-foreground">
                          {p.descripcion}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {p.categoria?.nombre ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{formatGs(p.precioBase)}</td>
                    <td className="px-4 py-2 text-center text-xs">
                      {p.tasaIva.replace('IVA_', '') + '%'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {p.esCombo && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          COMBO
                        </span>
                      )}
                      {!p.esVendible && (
                        <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          oculto
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/productos/${p.id}`}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                          aria-label="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            void handleEliminar(p.id, p.nombre);
                          }}
                          disabled={eliminar.isPending}
                          className={cn(
                            'rounded-md p-1.5 text-destructive hover:bg-destructive/10',
                            eliminar.isPending && 'opacity-50',
                          )}
                          aria-label="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginador — visible siempre que haya algún resultado */}
      {total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <label className="flex items-center gap-2">
              Mostrar
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              por página
            </label>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">
              {desde}–{hasta} de {total}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <PagerBtn
              onClick={() => setPage(1)}
              disabled={page === 1 || isFetching}
              ariaLabel="Primera página"
            >
              <ChevronsLeft className="h-4 w-4" />
            </PagerBtn>
            <PagerBtn
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
              ariaLabel="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </PagerBtn>
            <span className="px-2 text-xs text-muted-foreground">
              Página <strong className="text-foreground">{page}</strong> de {totalPages}
            </span>
            <PagerBtn
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              ariaLabel="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </PagerBtn>
            <PagerBtn
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages || isFetching}
              ariaLabel="Última página"
            >
              <ChevronsRight className="h-4 w-4" />
            </PagerBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function PagerBtn({
  onClick,
  disabled,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="rounded-md border border-input bg-background p-1.5 text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
