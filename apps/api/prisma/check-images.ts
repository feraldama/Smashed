/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

(async () => {
  const total = await p.productoVenta.count();
  const conImagen = await p.productoVenta.count({ where: { imagenUrl: { not: null } } });
  console.log(`Productos con imagen: ${conImagen} / ${total}`);

  const sample = await p.productoVenta.findMany({
    where: { imagenUrl: { not: null } },
    select: { codigo: true, nombre: true, imagenUrl: true },
    take: 5,
    orderBy: { codigo: 'asc' },
  });
  sample.forEach((s) => {
    console.log(`  - ${s.codigo}  ${s.nombre.padEnd(30)} → ${s.imagenUrl?.slice(0, 60)}...`);
  });

  await p.$disconnect();
})();
