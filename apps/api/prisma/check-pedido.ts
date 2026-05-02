/* eslint-disable no-console */
/** Verifica los movimientos de stock generados por el último pedido confirmado. */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
(async () => {
  const ultimo = await p.pedido.findFirst({
    where: { estado: 'CONFIRMADO' },
    orderBy: { createdAt: 'desc' },
  });
  if (!ultimo) {
    console.log('No hay pedidos confirmados');
    return;
  }
  console.log(`Pedido #${ultimo.numero} (${ultimo.id}) — total ₲${ultimo.total}`);
  console.log('Movimientos de stock generados al confirmar:');

  const movs = await p.movimientoStock.findMany({
    where: { pedidoId: ultimo.id },
    include: {
      producto: { select: { codigo: true, nombre: true, unidadMedida: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const m of movs) {
    const cod = (m.producto.codigo ?? '?').padEnd(8);
    const nom = m.producto.nombre.padEnd(28);
    const cant = m.cantidadSigned.toString().padStart(10);
    console.log(`  ${cod} ${nom} ${cant} ${m.producto.unidadMedida}`);
  }
  console.log(`\nTotal movimientos: ${movs.length}`);
  await p.$disconnect();
})();
