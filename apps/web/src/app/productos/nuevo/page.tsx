'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { ProductoForm } from '@/components/ProductoForm';

export default function NuevoProductoPage() {
  return (
    <AuthGate>
      <AdminShell>
        <header className="mb-4 flex items-center gap-3">
          <Link
            href="/productos"
            className="flex h-9 w-9 items-center justify-center rounded-md border hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Nuevo producto</h1>
            <p className="text-sm text-muted-foreground">
              Creá el producto. Después podés agregar receta y modificadores.
            </p>
          </div>
        </header>
        <ProductoForm />
      </AdminShell>
    </AuthGate>
  );
}
