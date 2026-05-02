/**
 * Tests del módulo inventario (insumos + ajustes de stock).
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

describe('GET /inventario', () => {
  it('cajero NO puede listar (sólo admin/gerente) → 403', async () => {
    const token = await login(CAJERO);
    const res = await request(app).get('/inventario').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin lista los insumos del seed (~37) con stock por sucursal activa', async () => {
    const token = await login(ADMIN);
    const res = await request(app).get('/inventario').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.insumos.length).toBeGreaterThanOrEqual(35);
    expect(res.body.insumos[0].stock).not.toBeNull();
    expect(res.body.sucursalAplicada).toBeTruthy();
  });

  it('búsqueda por nombre', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .get('/inventario?busqueda=Mayonesa')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.insumos.length).toBe(1);
    expect(res.body.insumos[0].nombre).toBe('Mayonesa');
  });
});

describe('POST /inventario', () => {
  it('crea insumo OK', async () => {
    const token = await login(ADMIN);
    const codigo = `TST-INS-${Date.now()}`;
    const res = await request(app)
      .post('/inventario')
      .set('Authorization', `Bearer ${token}`)
      .send({
        codigo,
        nombre: 'Insumo de prueba',
        unidadMedida: 'GRAMO',
        costoUnitario: 50,
        categoria: 'Test',
      });
    expect(res.status).toBe(201);
    expect(res.body.insumo.codigo).toBe(codigo);
    expect(res.body.insumo.costoUnitario).toBe('50');

    await prisma.productoInventario.delete({ where: { id: res.body.insumo.id } });
  });

  it('duplicado por código → 409', async () => {
    const token = await login(ADMIN);
    const r1 = await request(app)
      .post('/inventario')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: 'DUP-TST', nombre: 'A', unidadMedida: 'UNIDAD' });
    expect(r1.status).toBe(201);
    const id = r1.body.insumo.id;

    const r2 = await request(app)
      .post('/inventario')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: 'DUP-TST', nombre: 'B', unidadMedida: 'UNIDAD' });
    expect(r2.status).toBe(409);

    await prisma.productoInventario.delete({ where: { id } });
  });
});

describe('POST /inventario/ajustes', () => {
  it('ENTRADA_AJUSTE suma al stock', async () => {
    const token = await login(ADMIN);
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'PAN-001' },
    });
    const sucursal = await prisma.sucursal.findFirstOrThrow({
      where: { nombre: 'Asunción Centro' },
    });

    const stockAntes = await prisma.stockSucursal.findUnique({
      where: {
        productoInventarioId_sucursalId: {
          productoInventarioId: insumo.id,
          sucursalId: sucursal.id,
        },
      },
    });
    const stockAnterior = Number(stockAntes?.stockActual ?? 0);

    const res = await request(app)
      .post('/inventario/ajustes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productoInventarioId: insumo.id,
        sucursalId: sucursal.id,
        tipo: 'ENTRADA_AJUSTE',
        cantidad: 100,
        motivo: 'Compra extraordinaria',
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.stock.stockActual)).toBe(stockAnterior + 100);

    // revertir
    await prisma.stockSucursal.update({
      where: { id: stockAntes!.id },
      data: { stockActual: stockAnterior },
    });
    await prisma.movimientoStock.deleteMany({ where: { motivo: 'Compra extraordinaria' } });
  });

  it('SALIDA_MERMA resta + crea audit log', async () => {
    const token = await login(ADMIN);
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'VEG-001' },
    });
    const sucursal = await prisma.sucursal.findFirstOrThrow({
      where: { nombre: 'Asunción Centro' },
    });

    const stockAntes = await prisma.stockSucursal.findUnique({
      where: {
        productoInventarioId_sucursalId: {
          productoInventarioId: insumo.id,
          sucursalId: sucursal.id,
        },
      },
    });
    const stockAnterior = Number(stockAntes?.stockActual ?? 0);

    const res = await request(app)
      .post('/inventario/ajustes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productoInventarioId: insumo.id,
        sucursalId: sucursal.id,
        tipo: 'SALIDA_MERMA',
        cantidad: 50,
        motivo: 'Lechuga vencida',
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.stock.stockActual)).toBe(stockAnterior - 50);

    const audit = await prisma.auditLog.findFirst({
      where: { accion: 'AJUSTAR_STOCK', entidadId: insumo.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();

    // revertir
    await prisma.stockSucursal.update({
      where: { id: stockAntes!.id },
      data: { stockActual: stockAnterior },
    });
    await prisma.movimientoStock.deleteMany({ where: { motivo: 'Lechuga vencida' } });
    await prisma.auditLog.deleteMany({ where: { accion: 'AJUSTAR_STOCK', entidadId: insumo.id } });
  });
});

describe('DELETE /inventario/:id', () => {
  it('rechaza eliminar insumo en uso por receta → 409', async () => {
    const token = await login(ADMIN);
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'PAN-001' },
    });
    const res = await request(app)
      .delete(`/inventario/${insumo.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it('soft delete OK si no tiene receta', async () => {
    const token = await login(ADMIN);
    const r = await request(app)
      .post('/inventario')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: 'TMP-DEL', nombre: 'Tmp', unidadMedida: 'UNIDAD' });
    const id = r.body.insumo.id;

    const del = await request(app)
      .delete(`/inventario/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const después = await prisma.productoInventario.findUnique({ where: { id } });
    expect(después?.deletedAt).not.toBeNull();

    await prisma.productoInventario.delete({ where: { id } });
  });
});

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});
