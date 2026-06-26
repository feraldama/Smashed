'use client';

import { Plus } from 'lucide-react';
import Image from 'next/image';

import { cn, formatGs } from '@/lib/utils';

export interface ProductCardData {
  id: string;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  imagenUrl?: string | null;
  categoria?: string | null;
  esCombo?: boolean;
  /** Algún insumo del producto está en 0/negativo en la sucursal. Es sólo un
   *  AVISO visual — la venta NO se bloquea (se permite stock negativo). */
  sinStock?: boolean;
}

interface ProductCardProps {
  producto: ProductCardData;
  onClick?: (producto: ProductCardData) => void;
  className?: string;
}

/**
 * Tarjeta de producto para el grid del POS.
 *
 * Diseño:
 *  - Tile cuadrado, imagen arriba (16:9 o square), datos abajo
 *  - Click en cualquier parte → agrega al pedido
 *  - Aviso "Sin stock": badge visible, pero NO bloquea la venta (el sistema
 *    permite stock negativo) — sólo alerta al cajero.
 *  - Badge de combo en esquina superior izquierda
 *  - Botón "+" flotante con animación al hover
 */
export function ProductCard({ producto, onClick, className }: ProductCardProps) {
  const handleClick = () => {
    onClick?.(producto);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all',
        'hover:shadow-lg hover:-translate-y-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        producto.sinStock && 'border-amber-400/60',
        className,
      )}
    >
      {/* Imagen */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {producto.imagenUrl ? (
          <Image
            src={producto.imagenUrl}
            alt={producto.nombre}
            fill
            sizes="(min-width: 1280px) 20vw, (min-width: 768px) 25vw, 50vw"
            className={cn(
              'object-cover transition-transform duration-300',
              'group-hover:scale-105',
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <span className="text-xs">Sin imagen</span>
          </div>
        )}

        {producto.esCombo && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground shadow-md">
            COMBO
          </span>
        )}

        {producto.sinStock && (
          <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-md">
            Sin stock
          </span>
        )}

        {/* Plus button — aparece al hover */}
        <div
          className={cn(
            'absolute right-2 bottom-2 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'group-disabled:hidden',
          )}
        >
          <Plus className="h-5 w-5" />
        </div>
      </div>

      {/* Datos */}
      <div className="flex flex-1 flex-col justify-between gap-1 p-3">
        <div>
          {producto.categoria && (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {producto.categoria}
            </p>
          )}
          <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-card-foreground">
            {producto.nombre}
          </h3>
          {producto.descripcion && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {producto.descripcion}
            </p>
          )}
        </div>
        <p className="mt-2 text-base font-bold text-primary">{formatGs(producto.precio)}</p>
      </div>
    </button>
  );
}
