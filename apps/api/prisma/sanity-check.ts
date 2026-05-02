/* eslint-disable no-console */
/** Sanity check rápido del seed — corre con `tsx prisma/sanity-check.ts`. */
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const e = await p.empresa.findFirst({
    include: {
      sucursales: {
        include: {
          puntosExpedicion: { include: { timbrados: true } },
          cajas: true,
          zonasMesa: { include: { mesas: true } },
        },
      },
    },
  });
  if (!e) throw new Error('Empresa no encontrada');

  console.log('═════════════════════════════════════════════════');
  console.log(`Empresa: ${e.nombreFantasia} — RUC ${e.ruc}-${e.dv}`);
  console.log('═════════════════════════════════════════════════');

  for (const s of e.sucursales) {
    const totalMesas = s.zonasMesa.reduce((acc, z) => acc + z.mesas.length, 0);
    console.log(`\n📍 ${s.nombre} (establecimiento ${s.establecimiento})`);
    console.log(`   Dirección: ${s.direccion}`);
    console.log(`   Cajas: ${s.cajas.length} | Mesas: ${totalMesas}`);
    for (const pe of s.puntosExpedicion) {
      console.log(
        `   PtoExp ${pe.codigo} (${pe.descripcion}) — ${pe.timbrados.length} timbrado(s): ${pe.timbrados
          .map((t) => `${t.numero}/${t.tipoDocumento}`)
          .join(', ')}`,
      );
    }
  }

  const stockTotal = await p.stockSucursal.aggregate({ _sum: { stockActual: true } });
  const productosVentaCount = await p.productoVenta.count();
  const recetasCount = await p.receta.count();
  const itemsRecetaCount = await p.itemReceta.count();

  console.log('\n═════════════════════════════════════════════════');
  console.log(`Productos venta: ${productosVentaCount}`);
  console.log(`Recetas: ${recetasCount}`);
  console.log(`Items de receta: ${itemsRecetaCount}`);
  console.log(`Stock total agregado: ${stockTotal._sum.stockActual?.toString()}`);

  // Verifico la receta anidada (Smash Clásica usa "Salsa de la casa" como sub-producto)
  const smashClasica = await p.productoVenta.findFirst({
    where: { codigo: 'HAM-001' },
    include: {
      receta: {
        include: {
          items: {
            include: {
              insumo: { select: { nombre: true } },
              subProducto: { select: { nombre: true, esPreparacion: true } },
            },
          },
        },
      },
    },
  });
  console.log('\n═════════════════════════════════════════════════');
  console.log(`Receta de "${smashClasica?.nombre}" (con sub-receta anidada):`);
  smashClasica?.receta?.items.forEach((it) => {
    const what = it.insumo?.nombre ?? `↪ ${it.subProducto?.nombre} (sub-preparación)`;
    console.log(`   - ${what}: ${it.cantidad} ${it.unidadMedida}`);
  });

  // Verifico el combo
  const combo = await p.combo.findFirst({
    include: {
      productoVenta: { select: { nombre: true, precioBase: true } },
      grupos: {
        include: {
          opciones: { include: { productoVenta: { select: { nombre: true } } } },
        },
      },
    },
  });
  console.log('\n═════════════════════════════════════════════════');
  console.log(
    `Combo: "${combo?.productoVenta.nombre}" — Precio base ₲${combo?.productoVenta.precioBase}`,
  );
  combo?.grupos.forEach((g) => {
    console.log(`   ${g.nombre}:`);
    g.opciones.forEach((o) => {
      const extra = o.precioExtra > 0n ? ` (+₲${o.precioExtra})` : '';
      const def = o.esDefault ? ' [default]' : '';
      console.log(`     • ${o.productoVenta.nombre}${extra}${def}`);
    });
  });

  // Modificadores
  const modGrupos = await p.modificadorGrupo.findMany({ include: { opciones: true } });
  console.log('\n═════════════════════════════════════════════════');
  console.log(`Modificadores (${modGrupos.length} grupos):`);
  modGrupos.forEach((g) => {
    console.log(`   ${g.nombre} (${g.tipo}, ${g.obligatorio ? 'obligatorio' : 'opcional'}):`);
    g.opciones.forEach((o) => {
      const extra = o.precioExtra > 0n ? ` +₲${o.precioExtra}` : '';
      console.log(`     • ${o.nombre}${extra}`);
    });
  });

  console.log('\n✅ Sanity check OK\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
