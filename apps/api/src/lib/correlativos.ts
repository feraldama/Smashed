import { Prisma } from '@prisma/client';

import { Errors } from './errors.js';

/**
 * Numeración correlativa por sucursal, race-free.
 *
 * Incrementa el contador correspondiente de `Sucursal` con un
 * `UPDATE ... RETURNING` atómico: Postgres toma un row-lock exclusivo sobre la
 * fila de la sucursal, así que las operaciones concurrentes hacen cola y cada
 * una obtiene un número único y consecutivo (sin el clásico bug de
 * read-then-increment, que bajo concurrencia duplica o saltea números).
 *
 * Debe llamarse SIEMPRE dentro de una `$transaction` (el lock se mantiene hasta
 * el commit, serializando con el resto de la operación).
 */

type ContadorSucursal = 'pedido' | 'compra' | 'transferencia';

// Mapa a la columna física. Son literales fijos (no entran datos del usuario),
// así que es seguro interpolarlos como identificador vía `Prisma.raw`.
const COLUMNA: Record<ContadorSucursal, string> = {
  pedido: 'ultimo_numero_pedido',
  compra: 'ultimo_numero_compra',
  transferencia: 'ultimo_numero_transferencia',
};

export async function siguienteNumeroSucursal(
  tx: Prisma.TransactionClient,
  sucursalId: string,
  contador: ContadorSucursal,
): Promise<number> {
  const col = Prisma.raw(`"${COLUMNA[contador]}"`);
  const rows = await tx.$queryRaw<{ numero: number }[]>`
    UPDATE "sucursal"
    SET ${col} = ${col} + 1
    WHERE "id" = ${sucursalId}
    RETURNING ${col} AS "numero"
  `;
  const fila = rows[0];
  if (!fila) throw Errors.notFound('Sucursal no encontrada');
  return fila.numero;
}
