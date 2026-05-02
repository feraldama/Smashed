import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * Expansión recursiva de receta (BOM) — convierte un producto vendible en
 * cantidades de insumos crudos, atravesando sub-preparaciones.
 *
 * Reglas:
 *  - Si el producto no tiene receta → no descuenta nada (ej: bebidas que se cargan
 *    como ProductoInventario directo no usan este path).
 *  - `Receta.rinde` representa cuántas porciones produce esa receta. Para un
 *    producto vendible típico es 1 (cada vez que lo hacés produce 1 unidad).
 *    Para sub-preparaciones (salsas, masas) es el batch (ej: 100ml de salsa).
 *  - Detección de ciclos: si un sub-producto se referencia a sí mismo
 *    (directa o transitivamente) tira `Error('Ciclo detectado en receta')`.
 *
 * Returns: Map<productoInventarioId, cantidadTotal>
 */

export interface ItemRecetaSlim {
  productoInventarioId: string | null;
  subProductoVentaId: string | null;
  cantidad: Prisma.Decimal | number;
  esOpcional: boolean;
}

export interface RecetaSlim {
  productoVentaId: string;
  rinde: Prisma.Decimal | number;
  items: ItemRecetaSlim[];
}

/** Cliente Prisma genérico — acepta tx o el client global. */
type Client = PrismaClient | Prisma.TransactionClient;

const dec = (v: Prisma.Decimal | number): number =>
  typeof v === 'number' ? v : Number(v.toString());

/**
 * Versión productiva — pega contra Prisma para resolver recetas on-demand.
 *
 * Se hace un cache de recetas por productoVentaId dentro de la llamada para no
 * re-pegarle a la BD por el mismo sub-producto si aparece varias veces en la cadena.
 */
export async function expandirReceta(
  client: Client,
  productoVentaId: string,
  cantidad: number,
): Promise<Map<string, number>> {
  const cache = new Map<string, RecetaSlim | null>();
  return expandirInterno(client, productoVentaId, cantidad, new Set(), cache);
}

async function expandirInterno(
  client: Client,
  productoVentaId: string,
  cantidad: number,
  visitando: Set<string>,
  cache: Map<string, RecetaSlim | null>,
): Promise<Map<string, number>> {
  if (visitando.has(productoVentaId)) {
    throw new Error(`Ciclo detectado en receta: ${productoVentaId}`);
  }

  const consumo = new Map<string, number>();

  let receta = cache.get(productoVentaId);
  if (receta === undefined) {
    const found = await client.receta.findUnique({
      where: { productoVentaId },
      select: {
        productoVentaId: true,
        rinde: true,
        items: {
          select: {
            productoInventarioId: true,
            subProductoVentaId: true,
            cantidad: true,
            esOpcional: true,
          },
        },
      },
    });
    receta = found ?? null;
    cache.set(productoVentaId, receta);
  }

  if (!receta) return consumo;

  const rinde = dec(receta.rinde);
  if (rinde <= 0) return consumo;

  const factor = cantidad / rinde;

  // Para evitar mutar `visitando` para hermanos, clonamos al recurse
  const nuevoVisitando = new Set(visitando);
  nuevoVisitando.add(productoVentaId);

  for (const item of receta.items) {
    const cantNecesaria = dec(item.cantidad) * factor;

    if (item.productoInventarioId) {
      const prev = consumo.get(item.productoInventarioId) ?? 0;
      consumo.set(item.productoInventarioId, prev + cantNecesaria);
    } else if (item.subProductoVentaId) {
      const subConsumo = await expandirInterno(
        client,
        item.subProductoVentaId,
        cantNecesaria,
        nuevoVisitando,
        cache,
      );
      for (const [insumoId, cantSub] of subConsumo) {
        const prev = consumo.get(insumoId) ?? 0;
        consumo.set(insumoId, prev + cantSub);
      }
    }
  }

  return consumo;
}
