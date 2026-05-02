'use client';

import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { ProductoForm } from '@/components/ProductoForm';
import { RecetaEditor } from '@/components/RecetaEditor';
import { useProductoDetalle } from '@/hooks/useCatalogo';

export default function EditarProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <AdminShell>
        <Editar id={id} />
      </AdminShell>
    </AuthGate>
  );
}

function Editar({ id }: { id: string }) {
  const { data: producto, isLoading, isError } = useProductoDetalle(id);

  return (
    <>
      <header className="mb-4 flex items-center gap-3">
        <Link
          href="/productos"
          className="flex h-9 w-9 items-center justify-center rounded-md border hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {producto?.nombre ?? 'Editar producto'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {producto?.codigo ? `Código ${producto.codigo}` : 'Editar datos del producto'}
          </p>
        </div>
      </header>

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Error cargando el producto
        </div>
      )}

      {producto && (
        <div className="space-y-6">
          <ProductoForm producto={producto} />
          {!producto.esCombo && <RecetaEditor producto={producto} />}
        </div>
      )}
    </>
  );
}
