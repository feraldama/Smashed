/**
 * One-shot dev: restaura sucursales del seed que quedaron soft-deleted
 * por algún test mal diseñado. NO toca sucursales TEST_* (ésas se borran).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NOMBRES_SEED = ['Asunción Centro', 'San Lorenzo'];

const sucursales = await prisma.sucursal.findMany({
  where: { nombre: { in: NOMBRES_SEED } },
});
for (const s of sucursales) {
  if (s.deletedAt) {
    await prisma.sucursal.update({
      where: { id: s.id },
      data: { deletedAt: null, activa: true },
    });
    // eslint-disable-next-line no-console
    console.log(`✓ Restaurada: ${s.nombre}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`  OK: ${s.nombre} (no estaba borrada)`);
  }
}
await prisma.$disconnect();
