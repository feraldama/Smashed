import type { ModoStockReceta, Prisma, PrismaClient } from '@prisma/client';

/**
 * Expansión recursiva de receta (BOM) — convierte un producto vendible en
 * cantidades de insumos crudos, atravesando sub-preparaciones.
 *
 * Reglas:
 *  - Si el producto no tiene receta pero está vinculado a un insumo de reventa
 *    (`ProductoVenta.productoInventarioId`), descuenta `cantidadInventario` de
 *    ese insumo por unidad vendida (bebidas envasadas, snacks comprados ya
 *    hechos). Sin receta ni vínculo → no descuenta nada.
 *  - `Receta.rinde` representa cuántas porciones produce esa receta. Para un
 *    producto vendible típico es 1 (cada vez que lo hacés produce 1 unidad).
 *    Para sub-preparaciones (salsas, masas) es el batch (ej: 100ml de salsa).
 *  - Detección de ciclos: si un sub-producto se referencia a sí mismo
 *    (directa o transitivamente) tira `Error('Ciclo detectado en receta')`.
 *  - Modo de stock LOTE en sub-recetas: cuando una ItemReceta apunta a una
 *    sub-preparación cuya receta está en modo LOTE (con productoInventarioId
 *    espejo), se corta la recursión y se consume directamente del espejo.
 *    La cantidad necesaria de la subprep se mapea 1:1 al consumo del PI espejo.
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
  modoStock: ModoStockReceta;
  productoInventarioId: string | null;
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
 *
 * Si `productoVentaId` tiene receta en modo LOTE con espejo, devuelve consumo
 * del espejo directamente sin expandir a insumos crudos. Pasá
 * `ignorarModoLoteRaiz=true` para forzar expansión a insumos en el nivel raíz
 * (se usa al producir un lote, donde queremos consumir los insumos crudos
 * aunque la propia receta esté en modo LOTE — el modo LOTE de sub-recetas
 * sigue aplicando).
 */
export async function expandirReceta(
  client: Client,
  productoVentaId: string,
  cantidad: number,
  opts: { ignorarModoLoteRaiz?: boolean } = {},
): Promise<Map<string, number>> {
  const cache = new Map<string, RecetaSlim | null>();
  const reventaCache = new Map<string, ReventaSlim | null>();
  return expandirInterno(client, productoVentaId, cantidad, new Set(), cache, reventaCache, {
    esRaiz: true,
    ignorarModoLoteRaiz: opts.ignorarModoLoteRaiz ?? false,
  });
}

/** Vínculo de reventa: insumo directo de un ProductoVenta sin receta. */
interface ReventaSlim {
  productoInventarioId: string;
  cantidadInventario: number;
}

async function expandirInterno(
  client: Client,
  productoVentaId: string,
  cantidad: number,
  visitando: Set<string>,
  cache: Map<string, RecetaSlim | null>,
  reventaCache: Map<string, ReventaSlim | null>,
  ctx: { esRaiz: boolean; ignorarModoLoteRaiz: boolean },
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
        modoStock: true,
        productoInventarioId: true,
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

  if (!receta) {
    // Sin receta: ¿es un producto de reventa vinculado a un insumo directo?
    const reventa = await resolverReventa(client, productoVentaId, reventaCache);
    if (reventa) {
      consumo.set(reventa.productoInventarioId, cantidad * reventa.cantidadInventario);
    }
    return consumo;
  }

  // Modo LOTE en el nivel raíz: descontar del espejo en vez de expandir. Se
  // puede forzar la expansión con ignorarModoLoteRaiz (caso: producir el lote).
  const aplicarLoteRaiz =
    ctx.esRaiz &&
    !ctx.ignorarModoLoteRaiz &&
    receta.modoStock === 'LOTE' &&
    receta.productoInventarioId;
  if (aplicarLoteRaiz && receta.productoInventarioId) {
    consumo.set(receta.productoInventarioId, cantidad);
    return consumo;
  }

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
      // Recursión normal: el modo LOTE del sub-producto se evalúa dentro de
      // expandirInterno (esRaiz=true para esa llamada, lo que activa la rama
      // LOTE si corresponde). El propósito de `esRaiz` acá es solamente
      // distinguir el llamado top-level del usuario, no este sub-llamado.
      const subConsumo = await expandirInterno(
        client,
        item.subProductoVentaId,
        cantNecesaria,
        nuevoVisitando,
        cache,
        reventaCache,
        { esRaiz: true, ignorarModoLoteRaiz: false },
      );
      for (const [insumoId, cantSub] of subConsumo) {
        const prev = consumo.get(insumoId) ?? 0;
        consumo.set(insumoId, prev + cantSub);
      }
    }
  }

  return consumo;
}

/**
 * Resuelve el vínculo de reventa de un ProductoVenta sin receta. Devuelve el
 * insumo y la cantidad por unidad vendida, o null si no es de reventa. Cachea
 * el resultado (incluido el null) para no repegarle a la BD.
 */
async function resolverReventa(
  client: Client,
  productoVentaId: string,
  reventaCache: Map<string, ReventaSlim | null>,
): Promise<ReventaSlim | null> {
  const cached = reventaCache.get(productoVentaId);
  if (cached !== undefined) return cached;

  const prod = await client.productoVenta.findUnique({
    where: { id: productoVentaId },
    select: { productoInventarioId: true, cantidadInventario: true },
  });
  const reventa: ReventaSlim | null = prod?.productoInventarioId
    ? {
        productoInventarioId: prod.productoInventarioId,
        cantidadInventario: prod.cantidadInventario ? dec(prod.cantidadInventario) : 1,
      }
    : null;
  reventaCache.set(productoVentaId, reventa);
  return reventa;
}
