'use client';

import { ImageOff, Package } from 'lucide-react';

import { productoImagenSrc, type ProductoListado } from '@/hooks/useCatalogo';
import { cn } from '@/lib/utils';

interface Props {
  producto: ProductoListado;
  onClick: (p: ProductoListado) => void;
}

export function ProductoCard({ producto, onClick }: Props) {
  const requiereConfig = producto.esCombo || producto.tieneModificadores;
  const imgSrc = productoImagenSrc(producto);

  return (
    <button
      type="button"
      onClick={() => onClick(producto)}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-all',
        'hover:border-primary hover:shadow-md',
        'active:scale-[0.98]',
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={producto.nombre}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <ImageOff className="h-10 w-10" />
          </div>
        )}
        {producto.esCombo && (
          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow">
            Combo
          </span>
        )}
        {producto.tienePrecioSucursal && (
          <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">
            Precio sucursal
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-tight">{producto.nombre}</p>
        {producto.codigo && (
          <p className="text-[11px] text-muted-foreground">
            <Package className="mr-0.5 inline h-3 w-3" />
            {producto.codigo}
          </p>
        )}
        <div className="mt-auto flex items-baseline justify-between pt-1">
          <span className="text-base font-bold tabular-nums">
            Gs. {Number(producto.precio).toLocaleString('es-PY')}
          </span>
          {requiereConfig && (
            <span className="text-[10px] uppercase text-muted-foreground">elegir</span>
          )}
        </div>
      </div>
    </button>
  );
}
