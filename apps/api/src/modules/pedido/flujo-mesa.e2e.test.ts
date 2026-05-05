/**
 * Test E2E del happy path completo del flujo MESA — sirve de "smoke test"
 * para detectar regresiones que los tests unitarios por módulo no atrapan,
 * especialmente alrededor de los 3 entry points para confirmar pedidos
 * (`confirmarPedido`, `agregarItemsAPedido`, `aplicarConfirmacionInline`
 * desde comprobante) y la transición ENTREGADO → FACTURADO al cobrar.
 *
 * Recorre:
 *   abrir caja → tomar pedido MESA → agregar items → confirmar → cocina
 *   (EN_PREPARACION → LISTO) → entregar → emitir comprobante → cerrar Z.
 *
 * Asume seed estándar (1 empresa, sucursal "Asunción Centro" con Caja 1,
 * mesa #1, productos HAM-001 y HAM-002).
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const CAJERO_CENTRO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };
const COCINA_CENTRO = { email: 'cocina1@smash.com.py', password: 'Smash123!' };

async function login(creds: { email: string; password: string }) {
  const res = await request(app).post('/auth/login').send(creds);
  if (res.status !== 200) {
    throw new Error(`login fallido: ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken as string;
}

async function reset() {
  await prisma.movimientoCaja.deleteMany();
  await prisma.cierreCaja.deleteMany();
  await prisma.aperturaCaja.deleteMany();
  await prisma.caja.updateMany({ data: { estado: 'CERRADA' } });
  await prisma.movimientoStock.deleteMany();
  await prisma.pagoComprobante.deleteMany();
  await prisma.itemComprobante.deleteMany();
  await prisma.eventoSifen.deleteMany();
  await prisma.comprobante.deleteMany();
  await prisma.itemPedidoComboOpcion.deleteMany();
  await prisma.itemPedidoModificador.deleteMany();
  await prisma.itemPedido.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.timbrado.updateMany({ data: { ultimoNumeroUsado: 0 } });
  await prisma.sucursal.updateMany({ data: { ultimoNumeroPedido: 0 } });
  await prisma.stockSucursal.updateMany({ data: { stockActual: 1000 } });
  await prisma.mesa.updateMany({ data: { estado: 'LIBRE' } });
}

describe('E2E: flujo MESA completo (caja → pedido → cocina → entregar → cobrar → cierre Z)', () => {
  it('recorre abrir caja → MESA con cuenta abierta → cocina → entregar → cobrar → cierre Z', async () => {
    await reset();

    // ─── 1) Login cajero + abrir caja ─────────────────────────────────
    const tCajero = await login(CAJERO_CENTRO);

    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${tCajero}`);
    expect(cajas.status).toBe(200);
    const caja1 = cajas.body.cajas.find((c: { nombre: string }) => c.nombre === 'Caja 1');
    expect(caja1).toBeTruthy();

    const apertura = await request(app)
      .post(`/cajas/${caja1.id}/abrir`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ montoInicial: 100000, notas: 'inicio del turno' });
    expect(apertura.status).toBe(201);
    const aperturaId = apertura.body.apertura.id as string;

    // ─── 2) Crear pedido MESA con 1 hamburguesa ───────────────────────
    const mesa1 = await prisma.mesa.findFirstOrThrow({
      where: { zona: { sucursal: { nombre: 'Asunción Centro' } }, numero: 1 },
    });
    // Usamos bebidas para evitar el grupo modificador "Punto de cocción"
    // que es obligatorio en hamburguesas y haría el test ruidoso.
    const cocaId = (await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'BEB-001' } }))
      .id;
    const aguaId = (await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'BEB-002' } }))
      .id;

    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${tCajero}`)
      .send({
        tipo: 'MESA',
        mesaId: mesa1.id,
        items: [{ productoVentaId: cocaId, cantidad: 1 }],
      });
    expect(crear.status).toBe(201);
    expect(crear.body.pedido.estado).toBe('PENDIENTE');
    expect(crear.body.pedido.tipo).toBe('MESA');
    expect(crear.body.pedido.mesa.id).toBe(mesa1.id);
    const pedidoId = crear.body.pedido.id as string;

    // ─── 3) Cuenta abierta: agregar 1 agua más a la mesa ──────────────
    const agregar = await request(app)
      .post(`/pedidos/${pedidoId}/items`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ items: [{ productoVentaId: aguaId, cantidad: 1 }] });
    expect(agregar.status).toBe(200);
    expect(agregar.body.pedido.items.length).toBe(2);
    const totalEsperado = BigInt(agregar.body.pedido.total);
    expect(totalEsperado).toBeGreaterThan(0n);

    // ─── 4) Confirmar pedido → descuenta stock ────────────────────────
    const confirmar = await request(app)
      .post(`/pedidos/${pedidoId}/confirmar`)
      .set('Authorization', `Bearer ${tCajero}`);
    expect(confirmar.status).toBe(200);
    expect(confirmar.body.pedido.estado).toBe('CONFIRMADO');
    expect(confirmar.body.pedido.confirmadoEn).toBeTruthy();

    // Stock descontado: hay movimientos SALIDA_VENTA asociados al pedido
    const movsStock = await prisma.movimientoStock.findMany({
      where: { tipo: 'SALIDA_VENTA', pedidoId },
    });
    expect(movsStock.length).toBeGreaterThan(0);

    // ─── 5) Cocina avanza el pedido a EN_PREPARACION → LISTO ──────────
    const tCocina = await login(COCINA_CENTRO);

    const enPrep = await request(app)
      .patch(`/pedidos/${pedidoId}/estado`)
      .set('Authorization', `Bearer ${tCocina}`)
      .send({ estado: 'EN_PREPARACION' });
    expect(enPrep.status).toBe(200);
    expect(enPrep.body.pedido.estado).toBe('EN_PREPARACION');
    expect(enPrep.body.pedido.enPreparacionEn).toBeTruthy();

    const listo = await request(app)
      .patch(`/pedidos/${pedidoId}/estado`)
      .set('Authorization', `Bearer ${tCocina}`)
      .send({ estado: 'LISTO' });
    expect(listo.status).toBe(200);
    expect(listo.body.pedido.estado).toBe('LISTO');
    expect(listo.body.pedido.listoEn).toBeTruthy();

    // ─── 6) Entregar al cliente (sin comprobante todavía → ENTREGADO) ─
    const entregar = await request(app)
      .post(`/pedidos/${pedidoId}/entregar`)
      .set('Authorization', `Bearer ${tCajero}`);
    expect(entregar.status).toBe(200);
    expect(entregar.body.pedido.estado).toBe('ENTREGADO');
    expect(entregar.body.pedido.entregadoEn).toBeTruthy();

    // La mesa sigue OCUPADA porque la cuenta no se cerró (no hay comprobante).
    const mesaAntesCobrar = await prisma.mesa.findUnique({ where: { id: mesa1.id } });
    expect(mesaAntesCobrar?.estado).not.toBe('LIBRE');

    // ─── 7) Emitir comprobante TICKET (efectivo) ──────────────────────
    const totalNum = Number(totalEsperado);
    const emitir = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${tCajero}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: totalNum }],
      });
    expect(emitir.status).toBe(201);
    expect(emitir.body.comprobante.estado).toBe('EMITIDO');
    expect(emitir.body.comprobante.numero).toBe(1);
    expect(emitir.body.comprobante.numeroDocumento).toMatch(/^001-001-\d{7}$/);
    expect(emitir.body.comprobante.total).toBe(totalEsperado.toString());

    // ENTREGADO + comprobante → FACTURADO + mesa LIBRE
    const pedidoFinal = await prisma.pedido.findUnique({ where: { id: pedidoId } });
    expect(pedidoFinal?.estado).toBe('FACTURADO');
    const mesaPostCobrar = await prisma.mesa.findUnique({ where: { id: mesa1.id } });
    expect(mesaPostCobrar?.estado).toBe('LIBRE');

    // MovimientoCaja VENTA por el comprobante
    const movVenta = await prisma.movimientoCaja.findFirst({
      where: { aperturaCajaId: aperturaId, tipo: 'VENTA' },
    });
    expect(movVenta?.monto.toString()).toBe(totalEsperado.toString());

    // ─── 8) Cerrar caja Z y validar cuadre ────────────────────────────
    const cierre = await request(app)
      .post(`/cajas/aperturas/${aperturaId}/cerrar`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({
        // 100k inicial + venta efectivo
        totalContadoEfectivo: 100000 + totalNum,
        notas: 'cierre del turno',
      });
    expect(cierre.status).toBe(200);
    expect(cierre.body.cierre.totalEsperadoEfectivo).toBe((100000n + totalEsperado).toString());
    expect(cierre.body.cierre.totalContadoEfectivo).toBe((100000n + totalEsperado).toString());
    expect(cierre.body.cierre.diferenciaEfectivo).toBe('0');
    expect(cierre.body.cierre.totalVentas).toBe(totalEsperado.toString());

    const cajaFinal = await prisma.caja.findUnique({ where: { id: caja1.id } });
    expect(cajaFinal?.estado).toBe('CERRADA');
  });
});

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});
