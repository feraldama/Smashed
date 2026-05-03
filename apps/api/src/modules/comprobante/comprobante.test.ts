/**
 * Tests del módulo comprobante.
 * Asume seed: 1 timbrado activo de TICKET para Caja 1 de Centro (PuntoExpedicion 001).
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const CAJERO_CENTRO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };
const CAJERO_SLO = { email: 'cajero2@smash.com.py', password: 'Smash123!' };

async function login(creds: { email: string; password: string }) {
  const res = await request(app).post('/auth/login').send(creds);
  if (res.status !== 200) throw new Error(`login fallido: ${JSON.stringify(res.body)}`);
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
}

async function getProductoIdPorCodigo(codigo: string) {
  const p = await prisma.productoVenta.findFirstOrThrow({ where: { codigo } });
  return p.id;
}

async function abrirCajaYHacerPedido(token: string, codigo: string, cantidad = 1) {
  const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
  // Tomamos la "Caja 1" (que tiene puntoExpedicion asociado)
  const caja1 = cajas.body.cajas.find((c: { nombre: string }) => c.nombre === 'Caja 1');
  await request(app)
    .post(`/cajas/${caja1.id}/abrir`)
    .set('Authorization', `Bearer ${token}`)
    .send({ montoInicial: 100000 });

  const productoId = await getProductoIdPorCodigo(codigo);
  const crear = await request(app)
    .post('/pedidos')
    .set('Authorization', `Bearer ${token}`)
    .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: productoId, cantidad }] });

  await request(app)
    .post(`/pedidos/${crear.body.pedido.id}/confirmar`)
    .set('Authorization', `Bearer ${token}`);

  return { pedidoId: crear.body.pedido.id as string, total: crear.body.pedido.total as string };
}

describe('POST /comprobantes — emitir', () => {
  it('emite TICKET con numeración fiscal correcta + comprobante asociado al pedido', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const { pedidoId, total } = await abrirCajaYHacerPedido(token, 'HAM-001');

    const res = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(total) }],
      });
    expect(res.status).toBe(201);
    expect(res.body.comprobante.estado).toBe('EMITIDO');
    expect(res.body.comprobante.numeroDocumento).toMatch(/^001-001-\d{7}$/);
    expect(res.body.comprobante.numero).toBe(1); // primer comprobante
    expect(res.body.comprobante.tipoDocumento).toBe('TICKET');
    expect(res.body.comprobante.total).toBe(total);

    // El pedido del test estaba en CONFIRMADO al cobrar — emitir comprobante
    // sobre un pedido a mitad de servicio no avanza el estado (el cierre a
    // FACTURADO ocurre al "Entregar al cliente" si ya hay comprobante).
    const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
    expect(pedido?.estado).toBe('CONFIRMADO');

    // MovimientoCaja tipo VENTA creado
    const mov = await prisma.movimientoCaja.findFirst({
      where: { comprobanteId: res.body.comprobante.id, tipo: 'VENTA' },
    });
    expect(mov?.monto.toString()).toBe(total);
  });

  it('numeración correlativa por timbrado (segundo comprobante = #2)', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);

    // Primer pedido + comprobante
    const r1 = await abrirCajaYHacerPedido(token, 'HAM-001');
    const c1 = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId: r1.pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(r1.total) }],
      });
    expect(c1.body.comprobante.numero).toBe(1);

    // Segundo pedido (sin reset de caja) + comprobante
    const productoId = await getProductoIdPorCodigo('HAM-002');
    const crear2 = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: productoId, cantidad: 1 }] });
    await request(app)
      .post(`/pedidos/${crear2.body.pedido.id}/confirmar`)
      .set('Authorization', `Bearer ${token}`);

    const c2 = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId: crear2.body.pedido.id,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(crear2.body.pedido.total) }],
      });
    expect(c2.status).toBe(201);
    expect(c2.body.comprobante.numero).toBe(2);
    expect(c2.body.comprobante.numeroDocumento).toMatch(/^001-001-0000002$/);
  });

  it('subtotales discriminados por IVA — 1 hamburguesa al 10%', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const { pedidoId, total } = await abrirCajaYHacerPedido(token, 'HAM-001');

    const res = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(total) }],
      });
    // 35.000 con IVA 10% → IVA = 3182, base = 31818
    expect(res.body.comprobante.totalIva10).toBe('3182');
    expect(res.body.comprobante.subtotalIva10).toBe('31818');
    expect(res.body.comprobante.totalIva5).toBe('0');
    expect(res.body.comprobante.subtotalExentas).toBe('0');
  });

  it('múltiples pagos → suma debe igualar total', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const { pedidoId, total } = await abrirCajaYHacerPedido(token, 'HAM-001');
    const t = Number(total);

    const res = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [
          { metodo: 'EFECTIVO', monto: Math.floor(t / 2) },
          { metodo: 'TARJETA_DEBITO', monto: t - Math.floor(t / 2), referencia: 'auth-12345' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.comprobante.pagos.length).toBe(2);
    const movs = await prisma.movimientoCaja.findMany({
      where: { comprobanteId: res.body.comprobante.id },
    });
    expect(movs.length).toBe(2);
  });

  it('suma de pagos != total → 400', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const { pedidoId } = await abrirCajaYHacerPedido(token, 'HAM-001');

    const res = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: 1000 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('sin caja abierta → 409', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    // Crear pedido sin abrir caja primero
    const productoId = await getProductoIdPorCodigo('HAM-001');
    // Hack: para que esto funcione sin caja, crear un pedido y confirmarlo
    // (sin caja se permite, sólo emisión la requiere)
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: productoId, cantidad: 1 }] });
    await request(app)
      .post(`/pedidos/${crear.body.pedido.id}/confirmar`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId: crear.body.pedido.id,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: 35000 }],
      });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/caja abierta/);
  });

  it('pedido con comprobante emitido → 409 al intentar emitir otro', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const { pedidoId, total } = await abrirCajaYHacerPedido(token, 'HAM-001');

    await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(total) }],
      });

    const res = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(total) }],
      });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/comprobante/i);
  });

  it('pedido PENDIENTE (fast-food MOSTRADOR) → emite + auto-confirma + descuenta stock', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    const caja1 = cajas.body.cajas.find((c: { nombre: string }) => c.nombre === 'Caja 1');
    await request(app)
      .post(`/cajas/${caja1.id}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 100000 });

    const productoId = await getProductoIdPorCodigo('HAM-001');
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: productoId, cantidad: 1 }] });

    // Snapshot de stock pre-cobro: el pedido quedó PENDIENTE, no se descontó nada.
    const stockPre = await prisma.movimientoStock.count({
      where: { pedidoId: crear.body.pedido.id, tipo: 'SALIDA_VENTA' },
    });
    expect(stockPre).toBe(0);

    const res = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId: crear.body.pedido.id,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(crear.body.pedido.total) }],
      });
    expect(res.status).toBe(201);

    // El pedido pasó a CONFIRMADO (recién ahora va a cocina)
    const pedido = await prisma.pedido.findUnique({ where: { id: crear.body.pedido.id } });
    expect(pedido?.estado).toBe('CONFIRMADO');
    expect(pedido?.confirmadoEn).not.toBeNull();

    // Y el stock se descontó como parte de la emisión (movimiento SALIDA_VENTA)
    const stockPost = await prisma.movimientoStock.count({
      where: { pedidoId: crear.body.pedido.id, tipo: 'SALIDA_VENTA' },
    });
    expect(stockPost).toBeGreaterThan(0);
  });

  it('snapshot de receptor con cliente con RUC', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const { pedidoId, total } = await abrirCajaYHacerPedido(token, 'HAM-001');

    const cliente = await prisma.cliente.findFirstOrThrow({
      where: { razonSocial: 'CONSULTORA DEL ESTE S.A.' },
    });

    const res = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        clienteId: cliente.id,
        tipoDocumento: 'FACTURA',
        pagos: [{ metodo: 'TRANSFERENCIA', monto: Number(total) }],
      });
    expect(res.status).toBe(201);
    expect(res.body.comprobante.receptorRazonSocial).toBe('CONSULTORA DEL ESTE S.A.');
    expect(res.body.comprobante.receptorRuc).toBe(cliente.ruc);
    expect(res.body.comprobante.receptorDv).toBe(cliente.dv);
  });

  it('cuando no se pasa clienteId → usa "SIN NOMBRE" (consumidor final)', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const { pedidoId, total } = await abrirCajaYHacerPedido(token, 'HAM-001');

    const res = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(total) }],
      });
    expect(res.body.comprobante.receptorRazonSocial).toBe('SIN NOMBRE');
    expect(res.body.comprobante.receptorRuc).toBeNull();
  });

  it('campos SIFEN nulos pero presentes (preparados para Fase 4)', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const { pedidoId, total } = await abrirCajaYHacerPedido(token, 'HAM-001');
    const res = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(total) }],
      });
    expect(res.body.comprobante.cdc).toBeNull();
    expect(res.body.comprobante.estadoSifen).toBe('NO_ENVIADO');
    expect(res.body.comprobante.xmlFirmado).toBeNull();
    expect(res.body.comprobante.qrUrl).toBeNull();
  });
});

describe('POST /comprobantes/:id/anular', () => {
  it('anula OK + revierte movimientos de caja (caja abierta)', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const { pedidoId, total } = await abrirCajaYHacerPedido(token, 'HAM-001');

    const c = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(total) }],
      });

    const res = await request(app)
      .post(`/comprobantes/${c.body.comprobante.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Error de cobro' });
    expect(res.status).toBe(200);
    expect(res.body.comprobante.estado).toBe('ANULADO');

    // El movimiento de caja debe haber desaparecido (caja abierta)
    const movs = await prisma.movimientoCaja.findMany({
      where: { comprobanteId: c.body.comprobante.id },
    });
    expect(movs.length).toBe(0);
  });

  it('anular en pedido no entregado → cancela pedido + revierte stock', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const { pedidoId, total } = await abrirCajaYHacerPedido(token, 'HAM-001');

    // Stock inicial post-confirmación
    const stockTrasConfirmar = await prisma.movimientoStock.count({
      where: { pedidoId, tipo: 'SALIDA_VENTA' },
    });
    expect(stockTrasConfirmar).toBeGreaterThan(0);

    const c = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(total) }],
      });

    const res = await request(app)
      .post(`/comprobantes/${c.body.comprobante.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Cliente cambió de idea' });
    expect(res.status).toBe(200);

    // Pedido pasó a CANCELADO
    const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
    expect(pedido?.estado).toBe('CANCELADO');
    expect(pedido?.canceladoEn).not.toBeNull();

    // Hay un movimiento ENTRADA_AJUSTE de reverso
    const reverso = await prisma.movimientoStock.count({
      where: { pedidoId, tipo: 'ENTRADA_AJUSTE' },
    });
    expect(reverso).toBeGreaterThan(0);
  });

  it('anular en pedido ya entregado → solo evento fiscal, no cancela pedido', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const { pedidoId, total } = await abrirCajaYHacerPedido(token, 'HAM-001');

    const c = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(total) }],
      });

    // Marcar entregado al cliente
    await request(app)
      .post(`/pedidos/${pedidoId}/entregar`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/comprobantes/${c.body.comprobante.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Devolución contable' });
    expect(res.status).toBe(200);

    // El pedido queda como estaba — no se cancela porque ya se sirvió
    const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
    expect(pedido?.estado).not.toBe('CANCELADO');
  });

  it('anular dos veces → 409', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const { pedidoId, total } = await abrirCajaYHacerPedido(token, 'HAM-001');
    const c = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(total) }],
      });
    await request(app)
      .post(`/comprobantes/${c.body.comprobante.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'primera' });
    const res = await request(app)
      .post(`/comprobantes/${c.body.comprobante.id}/anular`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'segunda' });
    expect(res.status).toBe(409);
  });

  it('cajero de otra sucursal no puede anular → 403', async () => {
    await reset();
    const t1 = await login(CAJERO_CENTRO);
    const { pedidoId, total } = await abrirCajaYHacerPedido(t1, 'HAM-001');
    const c = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${t1}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(total) }],
      });

    const t2 = await login(CAJERO_SLO);
    const res = await request(app)
      .post(`/comprobantes/${c.body.comprobante.id}/anular`)
      .set('Authorization', `Bearer ${t2}`)
      .send({ motivo: 'sin permiso' });
    expect([403, 404]).toContain(res.status);
  });
});

describe('GET /comprobantes', () => {
  it('lista con sucursal del usuario aplicada', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const { pedidoId, total } = await abrirCajaYHacerPedido(token, 'HAM-001');
    await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(total) }],
      });

    const res = await request(app).get('/comprobantes').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.comprobantes.length).toBe(1);
    expect(res.body.comprobantes[0].numeroDocumento).toMatch(/^001-001-\d{7}$/);
  });
});

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});
