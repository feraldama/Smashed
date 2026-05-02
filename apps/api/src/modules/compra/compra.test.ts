/**
 * Tests del módulo compra — registro de compras a proveedores con efecto en stock.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' };
const CAJERO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };

async function login(creds: { email: string; password: string }) {
  const res = await request(app).post('/auth/login').send(creds);
  return res.body.accessToken as string;
}

async function getRefs() {
  const sucursal = await prisma.sucursal.findFirst({ where: { codigo: 'CEN' } });
  const proveedor = await prisma.proveedor.findFirst({
    where: { empresaId: sucursal?.empresaId, deletedAt: null, activo: true },
    orderBy: { razonSocial: 'asc' },
  });
  const insumo1 = await prisma.productoInventario.findFirst({
    where: { empresaId: sucursal?.empresaId, deletedAt: null, activo: true },
    orderBy: { nombre: 'asc' },
  });
  const insumo2 = await prisma.productoInventario.findFirst({
    where: {
      empresaId: sucursal?.empresaId,
      deletedAt: null,
      activo: true,
      id: { not: insumo1?.id ?? '' },
    },
    orderBy: { nombre: 'asc' },
  });
  if (!sucursal || !proveedor || !insumo1 || !insumo2) {
    throw new Error('Faltan datos del seed');
  }
  return { sucursal, proveedor, insumo1, insumo2 };
}

async function cleanupCompras() {
  // Borrar compras y movimientos de test que dejamos
  const compras = await prisma.compra.findMany({
    where: { numeroFactura: { startsWith: 'TEST_' } },
    select: { id: true },
  });
  if (compras.length > 0) {
    const ids = compras.map((c) => c.id);
    await prisma.movimientoStock.deleteMany({ where: { compraId: { in: ids } } });
    await prisma.itemCompra.deleteMany({ where: { compraId: { in: ids } } });
    await prisma.compra.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(cleanupCompras);
afterAll(cleanupCompras);

// ═══════════════════════════════════════════════════════════════════════════
//  POST /compras — creación + efecto en stock
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /compras', () => {
  it('cajero NO puede registrar compras → 403', async () => {
    const token = await login(CAJERO);
    const { sucursal, proveedor, insumo1 } = await getRefs();
    const res = await request(app)
      .post('/compras')
      .set('Authorization', `Bearer ${token}`)
      .send({
        proveedorId: proveedor.id,
        sucursalId: sucursal.id,
        items: [{ productoInventarioId: insumo1.id, cantidad: 5, costoUnitario: 1000 }],
      });
    expect(res.status).toBe(403);
  });

  it('admin registra compra y aumenta stock', async () => {
    await cleanupCompras();
    const token = await login(ADMIN);
    const { sucursal, proveedor, insumo1, insumo2 } = await getRefs();

    const stockAntes1 = await prisma.stockSucursal.findUnique({
      where: {
        productoInventarioId_sucursalId: {
          productoInventarioId: insumo1.id,
          sucursalId: sucursal.id,
        },
      },
    });
    const cantAntes1 = Number(stockAntes1?.stockActual ?? 0);

    const res = await request(app)
      .post('/compras')
      .set('Authorization', `Bearer ${token}`)
      .send({
        proveedorId: proveedor.id,
        sucursalId: sucursal.id,
        numeroFactura: 'TEST_F-001',
        notas: 'Test compra',
        items: [
          { productoInventarioId: insumo1.id, cantidad: 10, costoUnitario: 5000 },
          { productoInventarioId: insumo2.id, cantidad: 4.5, costoUnitario: 12000 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.compra.numero).toBeGreaterThan(0);
    // Total esperado: 10*5000 + 4.5*12000 = 50000 + 54000 = 104000
    expect(res.body.compra.total).toBe('104000');

    // Verificar stock
    const stockDespues = await prisma.stockSucursal.findUnique({
      where: {
        productoInventarioId_sucursalId: {
          productoInventarioId: insumo1.id,
          sucursalId: sucursal.id,
        },
      },
    });
    expect(Number(stockDespues?.stockActual ?? 0)).toBe(cantAntes1 + 10);

    // Verificar MovimientoStock con compraId
    const movs = await prisma.movimientoStock.findMany({
      where: { compraId: res.body.compra.id },
    });
    expect(movs.length).toBe(2);
    expect(movs[0]?.tipo).toBe('ENTRADA_COMPRA');
  });

  it('rechaza items vacíos → 400', async () => {
    const token = await login(ADMIN);
    const { sucursal, proveedor } = await getRefs();
    const res = await request(app).post('/compras').set('Authorization', `Bearer ${token}`).send({
      proveedorId: proveedor.id,
      sucursalId: sucursal.id,
      items: [],
    });
    expect(res.status).toBe(400);
  });

  it('rechaza cantidad ≤ 0 → 400', async () => {
    const token = await login(ADMIN);
    const { sucursal, proveedor, insumo1 } = await getRefs();
    const res = await request(app)
      .post('/compras')
      .set('Authorization', `Bearer ${token}`)
      .send({
        proveedorId: proveedor.id,
        sucursalId: sucursal.id,
        items: [{ productoInventarioId: insumo1.id, cantidad: 0, costoUnitario: 1000 }],
      });
    expect(res.status).toBe(400);
  });

  it('rechaza insumo de otra empresa → 404', async () => {
    const token = await login(ADMIN);
    const { sucursal, proveedor } = await getRefs();
    const res = await request(app)
      .post('/compras')
      .set('Authorization', `Bearer ${token}`)
      .send({
        proveedorId: proveedor.id,
        sucursalId: sucursal.id,
        items: [
          { productoInventarioId: 'cmoww0000000000000000000', cantidad: 1, costoUnitario: 100 },
        ],
      });
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  GET /compras
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /compras', () => {
  it('lista las compras con filtro por número de factura', async () => {
    await cleanupCompras();
    const token = await login(ADMIN);
    const { sucursal, proveedor, insumo1 } = await getRefs();

    await request(app)
      .post('/compras')
      .set('Authorization', `Bearer ${token}`)
      .send({
        proveedorId: proveedor.id,
        sucursalId: sucursal.id,
        numeroFactura: 'TEST_LIST_001',
        items: [{ productoInventarioId: insumo1.id, cantidad: 1, costoUnitario: 1000 }],
      });

    const res = await request(app)
      .get('/compras?numeroFactura=TEST_LIST')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.compras.length).toBeGreaterThanOrEqual(1);
    expect(res.body.compras[0].numeroFactura).toContain('TEST_LIST');
  });
});

describe('GET /compras/:id', () => {
  it('devuelve detalle con items y producto info', async () => {
    await cleanupCompras();
    const token = await login(ADMIN);
    const { sucursal, proveedor, insumo1 } = await getRefs();

    const create = await request(app)
      .post('/compras')
      .set('Authorization', `Bearer ${token}`)
      .send({
        proveedorId: proveedor.id,
        sucursalId: sucursal.id,
        numeroFactura: 'TEST_DET',
        items: [{ productoInventarioId: insumo1.id, cantidad: 3, costoUnitario: 2500 }],
      });
    const id = create.body.compra.id;

    const res = await request(app).get(`/compras/${id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.compra.items.length).toBe(1);
    expect(res.body.compra.items[0].producto.nombre).toBeTruthy();
    expect(res.body.compra.proveedor.razonSocial).toBeTruthy();
  });
});
