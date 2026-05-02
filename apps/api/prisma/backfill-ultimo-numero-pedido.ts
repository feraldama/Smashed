/**
 * One-shot backfill: sincroniza Sucursal.ultimoNumeroPedido con MAX(pedido.numero).
 * Sólo se ejecuta una vez para la BD que ya tenía pedidos antes de la migration
 * `add_ultimo_numero_pedido_sucursal`. Las migraciones futuras lo hacen en SQL.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sucursales = await prisma.sucursal.findMany({ select: { id: true, codigo: true } });
  for (const s of sucursales) {
    const last = await prisma.pedido.findFirst({
      where: { sucursalId: s.id },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });
    const max = last?.numero ?? 0;
    await prisma.sucursal.update({
      where: { id: s.id },
      data: { ultimoNumeroPedido: max },
    });
    // eslint-disable-next-line no-console
    console.log(`  ${s.codigo}: ultimoNumeroPedido = ${max}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
     
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
