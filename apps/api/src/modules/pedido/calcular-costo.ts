import { Prisma, type PrismaClient } from '@prisma/client';

import { expandirReceta } from './stock-recursivo.js';

/**
 * Cálculo de costo de producción de un ProductoVenta.
 *
 * Reutiliza `expandirReceta` para resolver la BOM recursiva y multiplica
 * la cantidad de cada insumo crudo por su costo vigente.
 *
 * Resolución del costo de cada insumo (en orden de preferencia):
 *  1. `StockSucursal.costoPromedio` de la sucursal pasada (si > 0): refleja
 *     el promedio ponderado real de las compras recibidas en esa sucursal.
 *  2. `ProductoInventario.costoUnitario`: fallback global por empresa, también
 *     mantenido por promedio ponderado de las sucursales.
 *
 * Limitaciones conocidas:
 *  - Productos sin receta devuelven 0 (esperado: bebidas envasadas que no se
 *    modelan como insumo).
 *  - No considera costo de modificadores (no tienen costo modelado).
 */

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Costo total estimado de producir `cantidad` unidades de `productoVentaId`.
 * Si se pasa `sucursalId`, se prefiere el costo promedio de esa sucursal
 * (más preciso). Devuelve BigInt en guaraníes (sin decimales).
 */
export async function calcularCostoProduccion(
  client: Client,
  productoVentaId: string,
  cantidad: number,
  sucursalId?: string,
): Promise<bigint> {
  const consumo = await expandirReceta(client, productoVentaId, cantidad);
  if (consumo.size === 0) return 0n;

  const insumoIds = Array.from(consumo.keys());

  // Costo global (fallback).
  const insumos = await client.productoInventario.findMany({
    where: { id: { in: insumoIds } },
    select: { id: true, costoUnitario: true },
  });
  const costoGlobalPorInsumo = new Map(insumos.map((i) => [i.id, i.costoUnitario]));

  // Costo por sucursal (preferido), si tenemos sucursalId.
  const costoSucursalPorInsumo = sucursalId
    ? new Map(
        (
          await client.stockSucursal.findMany({
            where: { productoInventarioId: { in: insumoIds }, sucursalId },
            select: { productoInventarioId: true, costoPromedio: true },
          })
        ).map((s) => [s.productoInventarioId, s.costoPromedio]),
      )
    : new Map<string, bigint>();

  let total = new Prisma.Decimal(0);
  for (const [insumoId, cantidadNecesaria] of consumo) {
    // Preferimos el costo de la sucursal si está vivo (> 0); sino global.
    const costoSuc = costoSucursalPorInsumo.get(insumoId);
    const costoUnitario = costoSuc && costoSuc > 0n ? costoSuc : costoGlobalPorInsumo.get(insumoId);
    if (!costoUnitario) continue;
    total = total.plus(new Prisma.Decimal(costoUnitario.toString()).times(cantidadNecesaria));
  }

  return BigInt(total.toFixed(0, Prisma.Decimal.ROUND_HALF_UP));
}

/**
 * Costo unitario estimado (por 1 unidad) de un ProductoVenta. Atajo para
 * snapshot al facturar: `await calcularCostoUnitario(tx, productoVentaId, sucursalId)`.
 */
export async function calcularCostoUnitario(
  client: Client,
  productoVentaId: string,
  sucursalId?: string,
): Promise<bigint> {
  return calcularCostoProduccion(client, productoVentaId, 1, sucursalId);
}
