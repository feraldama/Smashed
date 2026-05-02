/**
 * One-shot dev: borra productos creados manualmente durante pruebas que no
 * pertenecen al seed (identificados por code=null + creados después del seed).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
// Productos sin código creados después del seed (los del seed siempre traen código).
const huerfanos = await prisma.productoVenta.findMany({
  where: { codigo: null, deletedAt: null },
  select: { id: true, nombre: true },
});
// eslint-disable-next-line no-console
console.log(`Huérfanos: ${huerfanos.length}`);
for (const p of huerfanos) {
  await prisma.productoVenta.delete({ where: { id: p.id } });
  // eslint-disable-next-line no-console
  console.log(`  borrado: ${p.nombre}`);
}
await prisma.$disconnect();
