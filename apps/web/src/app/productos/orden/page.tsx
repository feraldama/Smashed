'use client';

import { ArrowLeft, GripVertical, Loader2, Utensils } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { toast } from '@/components/Toast';
import {
  type ProductoListado,
  productoImagenSrc,
  useProductos,
  useReordenarProductos,
} from '@/hooks/useCatalogo';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const SIN_CATEGORIA = '__sin_categoria__';

interface Grupo {
  id: string;
  nombre: string;
  productos: ProductoListado[];
}

export default function OrdenProductosPage() {
  return (
    <AuthGate>
      <AdminShell>
        <OrdenProductosScreen />
      </AdminShell>
    </AuthGate>
  );
}

function OrdenProductosScreen() {
  // Sólo productos vendibles: son los que el POS muestra como tarjetas, y el
  // orden que se edita acá es el de ese menú.
  const { data: productos = [], isLoading } = useProductos({});

  // Agrupamos en el orden en que vienen del backend (ya viene ordenado por
  // categoria.ordenMenu → producto.ordenMenu → nombre), así las secciones y las
  // tarjetas arrancan en el orden real del POS.
  const gruposServidor = useMemo<Grupo[]>(() => {
    const map = new Map<string, Grupo>();
    for (const p of productos) {
      const id = p.categoria?.id ?? SIN_CATEGORIA;
      const nombre = p.categoria?.nombre ?? 'Sin categoría';
      let g = map.get(id);
      if (!g) {
        g = { id, nombre, productos: [] };
        map.set(id, g);
      }
      g.productos.push(p);
    }
    return [...map.values()];
  }, [productos]);

  return (
    <div>
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/productos"
            className="rounded-md border border-input p-2 text-muted-foreground hover:bg-accent"
            aria-label="Volver a productos"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ordenar productos</h1>
            <p className="text-sm text-muted-foreground">
              Arrastrá los productos para definir en qué orden aparecen en el POS, dentro de cada
              categoría.
            </p>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : gruposServidor.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          <Utensils className="mx-auto mb-2 h-8 w-8 opacity-30" />
          No hay productos vendibles para ordenar.
        </div>
      ) : (
        <div className="space-y-6">
          {gruposServidor.map((g) => (
            <GrupoOrdenable key={g.id} grupo={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function GrupoOrdenable({ grupo }: { grupo: Grupo }) {
  const reordenar = useReordenarProductos();
  // Estado local del orden de la categoría. Se sincroniza cuando cambia la lista
  // que viene del servidor (incluido el refetch post-guardado).
  const [items, setItems] = useState<ProductoListado[]>(grupo.productos);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    setItems(grupo.productos);
  }, [grupo.productos]);

  function moverYGuardar(from: number, to: number) {
    if (from === to) return;
    const next = [...items];
    const movido = next[from];
    if (!movido) return;
    next.splice(from, 1);
    next.splice(to, 0, movido);
    setItems(next);
    reordenar.mutate(
      next.map((p) => p.id),
      {
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el orden');
          setItems(grupo.productos); // revertir al orden del servidor
        },
      },
    );
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex !== null) moverYGuardar(dragIndex, targetIndex);
    setDragIndex(null);
    setOverIndex(null);
  }

  // Mover por posición tipeada (1-based). Clampeamos al rango válido.
  function setPosicion(from: number, posicion1Based: number) {
    const to = Math.min(Math.max(posicion1Based, 1), items.length) - 1;
    moverYGuardar(from, to);
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
        <h2 className="text-sm font-semibold">{grupo.nombre}</h2>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {reordenar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {items.length} producto{items.length !== 1 ? 's' : ''}
        </span>
      </div>
      <ul className="divide-y">
        {items.map((p, index) => {
          const imgSrc = productoImagenSrc(p);
          return (
            <li
              key={p.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragIndex !== null && index !== overIndex) setOverIndex(index);
              }}
              onDrop={() => handleDrop(index)}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                'flex cursor-grab items-center gap-3 px-4 py-2.5 active:cursor-grabbing',
                'transition-colors hover:bg-muted/30',
                dragIndex === index && 'opacity-40',
                overIndex === index && dragIndex !== index && 'bg-primary/10',
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
              <PosicionInput
                posicion={index + 1}
                max={items.length}
                onCommit={(pos) => setPosicion(index, pos)}
              />
              {imgSrc ? (
                <Image
                  src={imgSrc}
                  alt=""
                  width={32}
                  height={32}
                  unoptimized
                  className="h-8 w-8 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="h-8 w-8 shrink-0 rounded-md bg-muted" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.nombre}</span>
              {p.esCombo && (
                <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  COMBO
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Input numérico para fijar la posición de un producto sin arrastrar. Mantiene
 * un estado local mientras se edita y recién aplica el cambio al confirmar
 * (Enter o blur), para no reordenar en cada tecla. Si queda vacío o sin cambios,
 * vuelve a mostrar la posición actual.
 */
function PosicionInput({
  posicion,
  max,
  onCommit,
}: {
  posicion: number;
  max: number;
  onCommit: (pos: number) => void;
}) {
  const [valor, setValor] = useState(String(posicion));

  // Resincronizar si la posición cambia desde afuera (drag, guardado, etc.).
  useEffect(() => {
    setValor(String(posicion));
  }, [posicion]);

  function commit() {
    const n = Number.parseInt(valor, 10);
    if (!Number.isFinite(n) || n === posicion) {
      setValor(String(posicion));
      return;
    }
    onCommit(n);
  }

  // No frenamos la propagación del drag desde el input: para reordenar tipeando
  // el usuario usa el campo; para arrastrar, agarra la fila por otro lado.
  return (
    <input
      type="number"
      min={1}
      max={max}
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValor(String(posicion));
          e.currentTarget.blur();
        }
      }}
      onDragStart={(e) => e.preventDefault()}
      aria-label="Posición"
      className="w-10 shrink-0 rounded-md border border-input bg-background px-1 py-0.5 text-right text-xs tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}
