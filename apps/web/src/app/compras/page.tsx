'use client';

import { Loader2, Package, Plus, Search, ShoppingCart, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { AdminShell } from '@/components/AdminShell';
import { AuthGate } from '@/components/AuthGate';
import { useCompras, type ListarComprasFiltros } from '@/hooks/useCompras';
import { useProveedores } from '@/hooks/useProveedores';
import { formatGs } from '@/lib/utils';

const ROLES_ADMIN = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN'] as const;

export default function ComprasPage() {
  return (
    <AuthGate roles={ROLES_ADMIN}>
      <AdminShell>
        <ComprasScreen />
      </AdminShell>
    </AuthGate>
  );
}

function ComprasScreen() {
  const [filtros, setFiltros] = useState<ListarComprasFiltros>({});
  const [busqFactura, setBusqFactura] = useState('');

  const { data: compras = [], isLoading } = useCompras({
    ...filtros,
    numeroFactura: busqFactura.trim() || undefined,
  });
  const { data: proveedores = [] } = useProveedores();

  const totalPeriodo = compras.reduce((sum, c) => sum + Number.parseInt(c.total, 10), 0);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShoppingCart className="h-6 w-6 text-primary" />
            Compras a proveedores
          </h1>
          <p className="text-sm text-muted-foreground">
            {compras.length} compra{compras.length !== 1 ? 's' : ''} listada
            {compras.length !== 1 ? 's' : ''} · <strong>{formatGs(totalPeriodo)}</strong> en total
          </p>
        </div>
        <Link
          href="/compras/nueva"
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Nueva compra
        </Link>
      </header>

      {/* Filtros */}
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_240px_180px_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={busqFactura}
            onChange={(e) => setBusqFactura(e.target.value)}
            placeholder="Buscar por N° factura..."
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm"
          />
          {busqFactura && (
            <button
              type="button"
              onClick={() => setBusqFactura('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:bg-muted"
              aria-label="Limpiar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          value={filtros.proveedorId ?? ''}
          onChange={(e) => setFiltros((f) => ({ ...f, proveedorId: e.target.value || undefined }))}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.razonSocial}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filtros.fechaDesde?.slice(0, 10) ?? ''}
          onChange={(e) =>
            setFiltros((f) => ({
              ...f,
              fechaDesde: e.target.value ? new Date(e.target.value).toISOString() : undefined,
            }))
          }
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Desde"
          aria-label="Fecha desde"
        />
        <input
          type="date"
          value={filtros.fechaHasta?.slice(0, 10) ?? ''}
          onChange={(e) =>
            setFiltros((f) => ({
              ...f,
              fechaHasta: e.target.value
                ? new Date(`${e.target.value}T23:59:59`).toISOString()
                : undefined,
            }))
          }
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Hasta"
          aria-label="Fecha hasta"
        />
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : compras.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          <Package className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="mb-1 font-medium text-foreground">Sin compras registradas</p>
          <p>Cargá la primera compra para que se sume al stock automáticamente.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">N°</th>
                <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                <th className="px-3 py-2 text-left font-semibold">Proveedor</th>
                <th className="px-3 py-2 text-left font-semibold">Sucursal</th>
                <th className="px-3 py-2 text-left font-semibold">Factura</th>
                <th className="px-3 py-2 text-right font-semibold">Items</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {compras.map((c) => (
                <tr key={c.id} className="hover:bg-accent/40">
                  <td className="px-3 py-2 font-mono">
                    <Link href={`/compras/${c.id}`} className="hover:underline">
                      #{c.numero}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {new Date(c.fecha).toLocaleDateString('es-PY', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-3 py-2">{c.proveedor.razonSocial}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.sucursal.codigo}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.numeroFactura ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{c._count.items}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">
                    {formatGs(Number.parseInt(c.total, 10))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
