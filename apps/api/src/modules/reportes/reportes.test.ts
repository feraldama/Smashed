/**
 * Tests del módulo reportes.
 *
 * Genera 2 comprobantes con sus pedidos y verifica que los reportes
 * agregan correctamente. Limpia al finalizar.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' };
const CAJERO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };

async function login(creds: { email: string; password: string }) {
  const r = await request(app).post('/auth/login').send(creds);
  return r.body.accessToken as string;
}

const ids: { pedidos: string[]; comprobantes: string[]; aperturas: string[] } = {
  pedidos: [],
  comprobantes: [],
  aperturas: [],
};

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
  ids.pedidos = [];
  ids.comprobantes = [];
  ids.aperturas = [];
}

// Inyecta opciones de modificadores obligatorios (ej: "Punto de cocción") que
// el servicio de pedidos exige para hamburguesas/lomitos.
async function modificadoresObligatoriosDe(productoVentaId: string) {
  const grupos = await prisma.productoVentaModificadorGrupo.findMany({
    where: { productoVentaId, modificadorGrupo: { obligatorio: true } },
    select: {
      modificadorGrupo: {
        select: { opciones: { take: 1, orderBy: { orden: 'asc' }, select: { id: true } } },
      },
    },
  });
  return grupos.flatMap((g) =>
    g.modificadorGrupo.opciones.map((o) => ({ modificadorOpcionId: o.id })),
  );
}

async function emitirVentas(token: string) {
  // Abrir caja
  const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
  const caja1 = cajas.body.cajas.find((c: { nombre: string }) => c.nombre === 'Caja 1');
  await request(app)
    .post(`/cajas/${caja1.id}/abrir`)
    .set('Authorization', `Bearer ${token}`)
    .send({ montoInicial: 100000 });

  const smash = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'HAM-001' } });
  const coca = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'BEB-001' } });
  const modsSmash = await modificadoresObligatoriosDe(smash.id);

  // Pedido 1: 2 Smash + 1 Coca = 70000 + 10000 = 80000
  const p1 = await request(app)
    .post('/pedidos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      tipo: 'MOSTRADOR',
      items: [
        { productoVentaId: smash.id, cantidad: 2, modificadores: modsSmash },
        { productoVentaId: coca.id, cantidad: 1 },
      ],
    });
  await request(app)
    .post(`/pedidos/${p1.body.pedido.id}/confirmar`)
    .set('Authorization', `Bearer ${token}`);
  await request(app)
    .post('/comprobantes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      pedidoId: p1.body.pedido.id,
      tipoDocumento: 'TICKET',
      pagos: [{ metodo: 'EFECTIVO', monto: 80000 }],
    });

  // Pedido 2: 1 Smash + 2 Cocas = 35000 + 20000 = 55000, pagado mixto
  const p2 = await request(app)
    .post('/pedidos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      tipo: 'MOSTRADOR',
      items: [
        { productoVentaId: smash.id, cantidad: 1, modificadores: modsSmash },
        { productoVentaId: coca.id, cantidad: 2 },
      ],
    });
  await request(app)
    .post(`/pedidos/${p2.body.pedido.id}/confirmar`)
    .set('Authorization', `Bearer ${token}`);
  await request(app)
    .post('/comprobantes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      pedidoId: p2.body.pedido.id,
      tipoDocumento: 'TICKET',
      pagos: [
        { metodo: 'EFECTIVO', monto: 30000 },
        { metodo: 'BANCARD', monto: 25000 },
      ],
    });

  return { totalVentas: 80000 + 55000, totalEfectivo: 80000 + 30000, totalBancard: 25000 };
}

describe('GET /reportes/ventas/resumen', () => {
  it('cajero NO puede ver reportes → 403', async () => {
    const token = await login(CAJERO);
    const res = await request(app)
      .get('/reportes/ventas/resumen?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin obtiene totales agregados', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    const { totalVentas } = await emitirVentas(tokenCajero);

    const tokenAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/ventas/resumen?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(Number(res.body.total)).toBe(totalVentas);
    expect(res.body.cantidad).toBe(2);
    expect(Number(res.body.ticketPromedio)).toBeCloseTo(totalVentas / 2, 0);
  });
});

describe('GET /reportes/ventas/por-dia', () => {
  it('agrupa por día', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    await emitirVentas(tokenCajero);

    const tokenAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/ventas/por-dia?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.series.length).toBeGreaterThanOrEqual(1);
    expect(res.body.series[0]).toMatchObject({
      fecha: expect.any(String),
      total: expect.any(String),
      cantidad: expect.any(String),
    });
  });
});

describe('GET /reportes/productos/top', () => {
  it('rankea productos por ingreso', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    await emitirVentas(tokenCajero);

    const tokenAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/productos/top?desde=2024-01-01&hasta=2030-01-01&limite=10')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.productos.length).toBe(2);
    // Smash: 3 unidades × 35000 = 105000 (más vendido por ingreso)
    expect(res.body.productos[0].nombre).toBe('Smash Clásica');
    expect(Number(res.body.productos[0].ingreso_total)).toBe(3 * 35000);
    // Coca: 3 unidades × 10000 = 30000
    expect(res.body.productos[1].nombre).toBe('Coca-Cola 500ml');
    expect(Number(res.body.productos[1].ingreso_total)).toBe(3 * 10000);
  });
});

describe('GET /reportes/ventas/metodos-pago', () => {
  it('agrupa por método', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    const { totalEfectivo, totalBancard } = await emitirVentas(tokenCajero);

    const tokenAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/ventas/metodos-pago?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    const efectivo = res.body.metodos.find((m: { metodo: string }) => m.metodo === 'EFECTIVO');
    const bancard = res.body.metodos.find((m: { metodo: string }) => m.metodo === 'BANCARD');
    expect(Number(efectivo.total)).toBe(totalEfectivo);
    expect(Number(bancard.total)).toBe(totalBancard);
  });
});

describe('GET /reportes/sucursales/comparativa', () => {
  it('admin ve ambas sucursales', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    const { totalVentas } = await emitirVentas(tokenCajero);

    const tokenAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/sucursales/comparativa?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.sucursales.length).toBe(2);
    const centro = res.body.sucursales.find(
      (s: { nombre: string }) => s.nombre === 'Asunción Centro',
    );
    const slo = res.body.sucursales.find((s: { nombre: string }) => s.nombre === 'San Lorenzo');
    expect(Number(centro.total)).toBe(totalVentas);
    expect(Number(slo.total)).toBe(0); // ningún comprobante
  });
});

describe('GET /reportes/inventario/stock-bajo', () => {
  it('lista insumos con stock <= mínimo', async () => {
    await reset();
    // Forzar que un insumo quede bajo
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'PAN-001' },
    });
    const sucursal = await prisma.sucursal.findFirstOrThrow({
      where: { nombre: 'Asunción Centro' },
    });
    const stock = await prisma.stockSucursal.findUnique({
      where: {
        productoInventarioId_sucursalId: {
          productoInventarioId: insumo.id,
          sucursalId: sucursal.id,
        },
      },
    });
    await prisma.stockSucursal.update({
      where: { id: stock!.id },
      data: { stockActual: 5, stockMinimo: 20 },
    });

    const token = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/inventario/stock-bajo')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const item = res.body.alertas.find((a: { codigo: string }) => a.codigo === 'PAN-001');
    expect(item).toBeDefined();
    expect(Number(item.stock_actual)).toBe(5);
    expect(Number(item.stock_minimo)).toBe(20);
  });
});

describe('GET /reportes/inventario/valuacion', () => {
  it('suma valor total del inventario', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/inventario/valuacion')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(Number(res.body.totalGeneral)).toBeGreaterThan(0);
  });
});

describe('GET /reportes/dashboard', () => {
  it('endpoint compuesto retorna todos los snapshots', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    await emitirVentas(tokenCajero);

    const token = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.hoy).toBeDefined();
    expect(res.body.ayer).toBeDefined();
    expect(res.body.semana).toBeDefined();
    expect(Array.isArray(res.body.ventasUltimos30)).toBe(true);
    expect(Array.isArray(res.body.topProductosSemana)).toBe(true);
    expect(Array.isArray(res.body.alertasStock)).toBe(true);
  });
});

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});
