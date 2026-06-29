/**
 * Script simple para limpiar items pegados usando SQL directo
 * Uso: npx tsx fix-stuck-item-direct.ts <numeroPedido>
 */

import '../src/config/env.js';

import { Pool } from 'pg';

async function main() {
  const args = process.argv.slice(2);
  const numeroPedido = parseInt(args[0], 10);

  if (isNaN(numeroPedido)) {
    console.error('❌ Uso: fix-stuck-item-direct.ts <numeroPedido>');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Buscar el pedido
    const pedidoResult = await pool.query(
      `SELECT id, numero, estado, tipo, total, created_at FROM pedido WHERE numero = $1`,
      [numeroPedido],
    );

    if (pedidoResult.rows.length === 0) {
      console.error(`❌ Pedido #${numeroPedido} no encontrado`);
      process.exit(1);
    }

    const pedido = pedidoResult.rows[0];
    console.log(`\n═══════════════════════════════════════════════`);
    console.log(`📋 PEDIDO #${pedido.numero}`);
    console.log(`═══════════════════════════════════════════════`);
    console.log(`ID:        ${pedido.id}`);
    console.log(`Tipo:      ${pedido.tipo}`);
    console.log(`Estado:    ${pedido.estado}`);
    console.log(`Total:     ${Number(pedido.total) / 1000} Gs`);
    console.log(`Creado:    ${new Date(pedido.created_at).toLocaleString('es-PY')}`);

    // Obtener items
    const itemsResult = await pool.query(
      `SELECT 
        ip.id, 
        ip.cantidad, 
        ip.estado,
        pv.nombre
      FROM item_pedido ip
      JOIN producto_venta pv ON ip.producto_venta_id = pv.id
      WHERE ip.pedido_id = $1
      ORDER BY ip.created_at`,
      [pedido.id],
    );

    console.log(`\n───────────────────────────────────────────────`);
    console.log(`ITEMS (${itemsResult.rows.length})`);
    console.log(`───────────────────────────────────────────────`);

    const pendientes = itemsResult.rows.filter((row) => row.estado === 'PENDIENTE');

    for (const item of itemsResult.rows) {
      const emoji = {
        PENDIENTE: '⏳',
        EN_PREPARACION: '👨‍🍳',
        LISTO: '✅',
        CANCELADO: '❌',
      }[item.estado];
      console.log(`${emoji} ${item.cantidad}× ${item.nombre} (${item.estado})`);
    }

    if (pendientes.length === 0) {
      console.log(`\n✅ No hay items PENDIENTE.`);
      process.exit(0);
    }

    console.log(`\n⚠️  ${pendientes.length} item(s) PENDIENTE encontrado(s).`);
    console.log(`\n🔧 Marcando todos como LISTO...`);

    const ahora = new Date();

    for (const item of pendientes) {
      await pool.query(`UPDATE item_pedido SET estado = 'LISTO', listo_en = $1 WHERE id = $2`, [
        ahora,
        item.id,
      ]);
      console.log(`   ✅ ${item.cantidad}× ${item.nombre} → LISTO`);
    }

    // Recalcular estado del pedido
    const noListoResult = await pool.query(
      `SELECT COUNT(*) as count FROM item_pedido WHERE pedido_id = $1 AND estado != 'LISTO'`,
      [pedido.id],
    );

    const noListo = parseInt(noListoResult.rows[0].count, 10);
    if (noListo === 0) {
      console.log(`\n✨ Todos los items están LISTO. Actualizando pedido...`);
      await pool.query(`UPDATE pedido SET estado = 'LISTO', listo_en = $1 WHERE id = $2`, [
        ahora,
        pedido.id,
      ]);
    }

    console.log(`\n✅ ¡Limpeza completada! La pantalla debería actualizarse automáticamente.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', (err as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
