'use client';

import { LogOut, Search, ShoppingBag, Store, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AuthGate } from '@/components/AuthGate';
import { CajaIndicator } from '@/components/CajaIndicator';
import { CartSidebar } from '@/components/CartSidebar';
import { ProductCard, type ProductCardData } from '@/components/ProductCard';
import { ProductoModal } from '@/components/ProductoModal';
import { toast } from '@/components/Toast';
import { useCategorias, useProductos, type ProductoListado } from '@/hooks/useProductos';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useCartStore } from '@/lib/cart-store';
import { cn } from '@/lib/utils';

export default function HomePage() {
  return (
    <AuthGate>
      <PosHome />
    </AuthGate>
  );
}

function PosHome() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clear);
  const itemsCarrito = useCartStore((s) => s.items);
  const agregarAlCarrito = useCartStore((s) => s.agregar);

  const [categoriaId, setCategoriaId] = useState<string | undefined>(undefined);
  const [busqueda, setBusqueda] = useState('');
  const [productoModalId, setProductoModalId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const categoriasQ = useCategorias();
  const productosQ = useProductos({
    categoriaId,
    busqueda: busqueda.trim() || undefined,
  });

  const sucursalActual = useMemo(() => {
    if (!user?.sucursalActivaId) return null;
    return user.sucursales.find((s) => s.id === user.sucursalActivaId) ?? null;
  }, [user]);

  const cartCount = itemsCarrito.reduce((acc, it) => acc + it.cantidad, 0);

  function handleClickProducto(p: ProductoListado) {
    // Si tiene combo o modificadores → abrir modal
    if (p.esCombo) {
      setProductoModalId(p.id);
      return;
    }
    // Para productos simples necesitamos saber si tiene modificadores aplicables.
    // El listado no trae esa info, así que abrimos el modal y él decide:
    // si no tiene nada que elegir, igual permite cantidad + observaciones.
    // Optimización futura: agregar `tieneModificadores: boolean` al listado para evitar el modal.
    // Por ahora: si NO es combo y tiene categoría tipo bebida/postre/empanada → agrega directo
    // (heurística simple para el demo).
    const sinElecciones = [
      'BEBIDA_FRIA',
      'BEBIDA_CALIENTE',
      'CERVEZA',
      'POSTRE',
      'EMPANADA',
      'CHIPA',
    ].includes(p.categoria?.categoriaBase ?? '');
    if (sinElecciones) {
      agregarAlCarrito({
        productoVentaId: p.id,
        nombre: p.nombre,
        imagenUrl: p.imagenUrl,
        precioBase: Number(p.precio),
        precioExtraCombo: 0,
        precioModificadores: 0,
        cantidad: 1,
        observaciones: null,
        modificadores: [],
        combosOpcion: [],
        esCombo: false,
      });
      toast.success(`${p.nombre} agregado`);
      return;
    }
    setProductoModalId(p.id);
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST', skipAuth: true }).catch(() => {});
    clearAuth();
    window.location.href = '/login';
  }

  return (
    <div className="flex min-h-screen bg-background lg:flex-row">
      <main className="flex-1">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="container flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Smash <span className="text-primary">POS</span>
              </h1>
              {sucursalActual && (
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Store className="h-3.5 w-3.5" />
                  <span>{sucursalActual.nombre}</span>
                  <span className="font-mono">· {sucursalActual.establecimiento}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <CajaIndicator />
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {user?.nombreCompleto}
              </span>
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <LogOut className="h-3.5 w-3.5" /> Salir
              </button>
              {/* FAB del carrito (sólo mobile/tablet) */}
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="relative flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 lg:hidden"
                aria-label="Abrir carrito"
              >
                <ShoppingBag className="h-3.5 w-3.5" />
                {cartCount > 0 && (
                  <span className="rounded-full bg-primary-foreground/20 px-1.5 text-[10px] font-bold">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Barra de búsqueda */}
          <div className="container pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto, código o código de barras..."
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Categorías (tabs) */}
          <div className="container flex gap-1.5 overflow-x-auto pb-3 [scrollbar-width:thin]">
            <CategoriaPill
              label="Todos"
              count={productosQ.data?.productos.length}
              active={!categoriaId}
              onClick={() => setCategoriaId(undefined)}
            />
            {categoriasQ.data?.map((c) => (
              <CategoriaPill
                key={c.id}
                label={c.nombre}
                count={c.totalProductos}
                active={categoriaId === c.id}
                onClick={() => setCategoriaId(c.id)}
              />
            ))}
          </div>
        </header>

        {/* Grid de productos */}
        <section className="container py-6">
          {productosQ.isLoading && <GridSkeleton />}

          {productosQ.isError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              Error cargando productos. Verificá que el API esté corriendo.
            </div>
          )}

          {productosQ.data && productosQ.data.productos.length === 0 && (
            <div className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No hay productos que coincidan con los filtros.
            </div>
          )}

          {productosQ.data && productosQ.data.productos.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
              {productosQ.data.productos.map((p) => {
                const card: ProductCardData = {
                  id: p.id,
                  nombre: p.nombre,
                  descripcion: p.descripcion,
                  precio: Number(p.precio),
                  imagenUrl: p.imagenUrl,
                  categoria: p.categoria?.nombre ?? null,
                  esCombo: p.esCombo,
                };
                return (
                  <ProductCard key={p.id} producto={card} onClick={() => handleClickProducto(p)} />
                );
              })}
            </div>
          )}
        </section>

        <footer className="border-t bg-muted/30 py-4 text-center text-xs text-muted-foreground">
          Smash POS · Datos del API real ({productosQ.data?.productos.length ?? '...'} productos)
        </footer>
      </main>

      <CartSidebar open={cartOpen} onClose={() => setCartOpen(false)} />

      {productoModalId && (
        <ProductoModal productoId={productoModalId} onClose={() => setProductoModalId(null)} />
      )}
    </div>
  );
}

function CategoriaPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background hover:bg-accent',
      )}
    >
      {label}
      {typeof count === 'number' && (
        <span
          className={cn(
            'rounded-full px-1.5 text-[10px] font-bold',
            active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border bg-card">
          <div className="aspect-[4/3] w-full animate-pulse bg-muted" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
