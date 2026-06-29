/**
 * Script para limpiar items "pegados" en el mostrador.
 * Uso: npx ts-node fix-stuck-item.ts <numeroPedido> [nombreProducto]
 *
 * Ejemplo: npx ts-node fix-stuck-item.ts 90 "Agua con Gas"
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const numeroPedido = parseInt(args[0] ?? '', 10);
  const nombreProducto = args[1];

  if (isNaN(numeroPedido)) {
    console.error('❌ Uso: fix-stuck-item.ts <numeroPedido> [nombreProducto]');
    console.error('   Ej: fix-stuck-item.ts 90 "Agua con Gas"');
    process.exit(1);
  }

  try {
    // Buscar el pedido por número
    const pedido = await prisma.pedido.findFirst({
      where: { numero: numeroPedido },
      include: { items: true },
    });

    if (!pedido) {
      console.error(`❌ Pedido #${numeroPedido} no encontrado`);
      process.exit(1);
    }

    console.log(`\n📋 Pedido encontrado:`);
    console.log(`   ID: ${pedido.id}`);
    console.log(`   Número: #${pedido.numero}`);
    console.log(`   Tipo: ${pedido.tipo}`);
    console.log(`   Estado: ${pedido.estado}`);
    console.log(`   Items totales: ${pedido.items.length}`);

    // Filtrar por nombre si se proporciona
    let itemsALimpiar = pedido.items.filter((it) => it.estado === 'PENDIENTE');
    if (nombreProducto) {
      // Buscar el item en la BD para confirmar el nombre
      const itemConNombre = await prisma.itemPedido.findFirst({
        where: {
          pedidoId: pedido.id,
          productoVenta: { nombre: { contains: nombreProducto, mode: 'insensitive' } },
        },
        include: { productoVenta: true },
      });
      if (itemConNombre) {
        itemsALimpiar = itemsALimpiar.filter((it) => it.id === itemConNombre.id);
      }
    }

    if (itemsALimpiar.length === 0) {
      console.log(
        `\n✅ No hay items PENDIENTE${nombreProducto ? ` con el nombre "${nombreProducto}"` : ''} en este pedido.`,
      );
      process.exit(0);
    }

    console.log(`\n🎯 Items PENDIENTE encontrados (${itemsALimpiar.length}):`);
    for (const item of itemsALimpiar) {
      const prod = await prisma.productoVenta.findUnique({ where: { id: item.productoVentaId } });
      console.log(`   - ${item.cantidad}× ${prod?.nombre || 'Desconocido'} (ID: ${item.id})`);
    }

    // Cambiar estado de los items a "LISTO"
    console.log(`\n⏳ Marcando items como LISTO...`);
    const ahora = new Date();

    for (const item of itemsALimpiar) {
      await prisma.itemPedido.update({
        where: { id: item.id },
        data: {
          estado: 'LISTO',
          listoEn: ahora,
        },
      });
      console.log(`   ✅ Item ${item.id} → LISTO`);
    }

    // Recalcular estado del pedido
    const itemsNoListo = await prisma.itemPedido.count({
      where: {
        pedidoId: pedido.id,
        estado: { not: 'LISTO' },
      },
    });

    if (itemsNoListo === 0) {
      console.log(`\n✨ Todos los items están LISTO. Cambiando pedido a LISTO...`);
      await prisma.pedido.update({
        where: { id: pedido.id },
        data: {
          estado: 'LISTO',
          listoEn: ahora,
        },
      });
    }

    console.log(`\n✅ Limpeza completada exitosamente!`);
    console.log(`   El mostrador debería actualizarse en breve.`);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
