/**
 * Script interactivo para inspeccionar y limpiar items pegados en el mostrador.
 * Uso: npx tsx inspect-pedido.ts <numeroPedido>
 *
 * Ejemplo: npx tsx inspect-pedido.ts 90
 */

import '../src/config/env.js';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient({
  adapter: new PrismaPg(),
  log: [],
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function pregunta(msg: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(msg, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const numeroPedido = parseInt(args[0], 10);

  if (isNaN(numeroPedido)) {
    console.error('❌ Uso: inspect-pedido.ts <numeroPedido>');
    console.error('   Ej: inspect-pedido.ts 90');
    process.exit(1);
  }

  try {
    // Buscar el pedido
    const pedido = await prisma.pedido.findFirst({
      where: { numero: numeroPedido },
      include: {
        items: {
          include: { productoVenta: true },
        },
      },
    });

    if (!pedido) {
      console.error(`\n❌ Pedido #${numeroPedido} no encontrado`);
      process.exit(1);
    }

    console.log(`\n${'═'.repeat(50)}`);
    console.log(`📋 PEDIDO #${pedido.numero}`);
    console.log(`${'═'.repeat(50)}`);
    console.log(`ID:           ${pedido.id}`);
    console.log(`Tipo:         ${pedido.tipo}`);
    console.log(`Estado:       ${pedido.estado}`);
    console.log(`Creado:       ${new Date(pedido.creadoEn).toLocaleString('es-PY')}`);
    console.log(
      `Total:        ${(Number(pedido.total) / 1000).toLocaleString('es-PY', { style: 'currency', currency: 'PYG' })}`,
    );

    // Listar items
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`ITEMS (${pedido.items.length} total):`);
    console.log(`${'─'.repeat(50)}`);

    for (let i = 0; i < pedido.items.length; i++) {
      const item = pedido.items[i];
      const estadoEmoji = {
        PENDIENTE: '⏳',
        EN_PREPARACION: '👨‍🍳',
        LISTO: '✅',
        CANCELADO: '❌',
      }[item.estado];

      console.log(
        `${i + 1}. ${estadoEmoji} ${item.cantidad}× ${item.productoVenta.nombre} (${item.estado})`,
      );
      console.log(`   ID: ${item.id}`);
    }

    // Filtrar items problemáticos
    const itemsProblematicos = pedido.items.filter((it) => it.estado === 'PENDIENTE');

    if (itemsProblematicos.length === 0) {
      console.log(`\n✅ No hay items PENDIENTE. ¡Pedido en orden!`);
      rl.close();
      process.exit(0);
    }

    console.log(`\n⚠️  ${itemsProblematicos.length} item(s) en estado PENDIENTE encontrado(s).`);

    // Preguntar qué hacer
    const accion = await pregunta(
      `\n¿Qué deseas hacer?\n1. Marcar todos como LISTO\n2. Cancelar los pendientes\n3. Salir\nOpción (1-3): `,
    );

    if (accion === '1') {
      const confirmar = await pregunta(
        `\n⚠️  Esto marcará ${itemsProblematicos.length} item(s) como LISTO. ¿Confirmar? (s/n): `,
      );
      if (confirmar.toLowerCase() !== 's') {
        console.log('Cancelado.');
        rl.close();
        process.exit(0);
      }

      const ahora = new Date();
      for (const item of itemsProblematicos) {
        await prisma.itemPedido.update({
          where: { id: item.id },
          data: {
            estado: 'LISTO',
            listoEn: ahora,
          },
        });
        console.log(`✅ ${item.cantidad}× ${item.productoVenta.nombre} → LISTO`);
      }

      // Recalcular estado del pedido
      const itemsNoListo = await prisma.itemPedido.count({
        where: {
          pedidoId: pedido.id,
          estado: { not: 'LISTO' },
        },
      });

      if (itemsNoListo === 0) {
        console.log('\n✨ Todos los items están LISTO. Actualizando pedido...');
        await prisma.pedido.update({
          where: { id: pedido.id },
          data: {
            estado: 'LISTO',
            listoEn: ahora,
          },
        });
      }

      console.log('\n✅ ¡Limpeza completada! La pantalla debería actualizarse automáticamente.');
    } else if (accion === '2') {
      const confirmar = await pregunta(
        `\n⚠️  ADVERTENCIA: Esto cancelará ${itemsProblematicos.length} item(s) PERMANENTEMENTE.\n¿Confirmar? (escribir "si" para continuar): `,
      );
      if (confirmar.toLowerCase() !== 'si') {
        console.log('Cancelado.');
        rl.close();
        process.exit(0);
      }

      const ahora = new Date();
      for (const item of itemsProblematicos) {
        await prisma.itemPedido.update({
          where: { id: item.id },
          data: {
            estado: 'CANCELADO',
            canceladoEn: ahora,
          },
        });
        console.log(`🗑️  ${item.cantidad}× ${item.productoVenta.nombre} → CANCELADO`);
      }

      console.log('\n✅ Items cancelados. La pantalla debería actualizarse automáticamente.');
    } else {
      console.log('Saliendo...');
    }

    rl.close();
  } catch (err) {
    console.error('❌ Error:', err);
    rl.close();
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
