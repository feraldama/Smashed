'use client';

import { ArrowLeft, Building2, Calendar, FileText, Loader2, Package, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { useCompra } from '@/hooks/useCompras';
import { formatGs } from '@/lib/utils';

export default function CompraDetallePage() {
  return (
    <AuthGate>
      <AdminShell>
        <CompraDetalleScreen />
      </AdminShell>
    </AuthGate>
  );
}

function CompraDetalleScreen() {
  const { id } = useParams<{ id: string }>();
  const { data: compra, isLoading, isError } = useCompra(id);

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !compra) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        No se pudo cargar la compra.{' '}
        <Link href="/compras" className="underline">
          Volver al listado
        </Link>
        .
      </div>
    );
  }

  return (
    <div>
      <header className="mb-5">
        <Link
          href="/compras"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver al listado
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            Compra <span className="font-mono text-primary">#{compra.numero}</span>
          </h1>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            Registrada
          </span>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Items */}
        <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <h2 className="border-b px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Items ({compra.items.length})
          </h2>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Insumo</th>
                <th className="px-3 py-2 text-right font-semibold">Cant.</th>
                <th className="px-3 py-2 text-left font-semibold">UM</th>
                <th className="px-3 py-2 text-right font-semibold">Costo unit.</th>
                <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {compra.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2">
                    <p className="font-medium">{it.producto.nombre}</p>
                    {it.producto.codigo && (
                      <p className="text-xs text-muted-foreground">{it.producto.codigo}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{it.cantidad}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {it.producto.unidadMedida}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {formatGs(Number.parseInt(it.costoUnitario, 10))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {formatGs(Number.parseInt(it.subtotal, 10))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/30">
                <td colSpan={4} className="px-3 py-3 text-right text-sm font-semibold">
                  Total:
                </td>
                <td className="px-3 py-3 text-right font-mono text-base font-bold">
                  {formatGs(Number.parseInt(compra.total, 10))}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Sidebar info */}
        <aside className="space-y-4">
          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Receipt className="h-3.5 w-3.5" /> Comprobante
            </h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">N° factura proveedor</dt>
                <dd className="font-mono">{compra.numeroFactura ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Fecha</dt>
                <dd className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {new Date(compra.fecha).toLocaleDateString('es-PY', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Registrada</dt>
                <dd className="text-xs">{new Date(compra.createdAt).toLocaleString('es-PY')}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Package className="h-3.5 w-3.5" /> Proveedor
            </h3>
            <p className="text-sm font-semibold">{compra.proveedor.razonSocial}</p>
            {compra.proveedor.ruc && (
              <p className="text-xs text-muted-foreground">
                RUC {compra.proveedor.ruc}-{compra.proveedor.dv}
              </p>
            )}
            {compra.proveedor.contacto && (
              <p className="mt-1 text-xs">Contacto: {compra.proveedor.contacto}</p>
            )}
            {compra.proveedor.telefono && (
              <p className="text-xs text-muted-foreground">{compra.proveedor.telefono}</p>
            )}
          </section>

          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" /> Sucursal de ingreso
            </h3>
            <p className="text-sm font-semibold">{compra.sucursal.nombre}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {compra.sucursal.codigo} · Estab. {compra.sucursal.establecimiento}
            </p>
          </section>

          {compra.notas && (
            <section className="rounded-lg border bg-card p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText className="h-3.5 w-3.5" /> Notas
              </h3>
              <p className="whitespace-pre-wrap text-sm">{compra.notas}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
