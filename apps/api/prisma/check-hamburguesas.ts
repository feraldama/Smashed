import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const cat = await prisma.categoriaProductoEmpresa.findFirst({
  where: { nombre: 'Hamburguesas' },
});
const prods = await prisma.productoVenta.findMany({
  where: { categoriaId: cat?.id, deletedAt: null },
  select: { id: true, codigo: true, nombre: true, esVendible: true, esPreparacion: true, createdAt: true },
});
// eslint-disable-next-line no-console
console.log('Productos en Hamburguesas:', prods.length);
for (const p of prods) {
  // eslint-disable-next-line no-console
  console.log(` - ${p.codigo} ${p.nombre} (vendible=${p.esVendible}, prep=${p.esPreparacion}) created=${p.createdAt.toISOString()}`);
}
await prisma.$disconnect();
