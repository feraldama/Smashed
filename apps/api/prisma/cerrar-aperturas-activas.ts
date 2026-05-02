/**
 * One-shot dev: cierra todas las aperturas de caja activas para destrabar
 * tests/smokes cuando un usuario distinto las dejó abiertas.
 * Uso: pnpm exec tsx prisma/cerrar-aperturas-activas.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const aperturas = await prisma.aperturaCaja.findMany({
  where: { cierre: null },
  include: { caja: true, usuario: true },
});
// eslint-disable-next-line no-console
console.log(`Aperturas activas: ${aperturas.length}`);
for (const a of aperturas) {
  // eslint-disable-next-line no-console
  console.log(`  ${a.caja.nombre} por ${a.usuario.email}`);
  await prisma.cierreCaja.create({
    data: {
      cajaId: a.cajaId,
      aperturaCajaId: a.id,
      usuarioId: a.usuarioId,
      totalEsperadoEfectivo: a.montoInicial,
      totalContadoEfectivo: a.montoInicial,
      diferenciaEfectivo: 0n,
      totalVentas: 0n,
      totalesPorMetodo: {},
      conteoEfectivo: { '100000': 1 },
      notas: 'cierre auto (cerrar-aperturas-activas)',
    },
  });
  await prisma.caja.update({ where: { id: a.cajaId }, data: { estado: 'CERRADA' } });
}
// eslint-disable-next-line no-console
console.log('✓ Cerradas');
await prisma.$disconnect();
