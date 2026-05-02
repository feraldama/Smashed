/**
 * Tests del módulo transferencia — movimiento de stock entre sucursales.
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
  const sucCentro = await prisma.sucursal.findFirst({ where: { codigo: 'CEN' } });
  const sucSlo = await prisma.sucursal.findFirst({ where: { codigo: 'SLO' } });
  const insumo = await prisma.productoInventario.findFirst({
    where: { empresaId: sucCentro?.empresaId, deletedAt: null, activo: true },
    orderBy: { nombre: 'asc' },
  });
  if (!sucCentro || !sucSlo || !insumo) throw new Error('Faltan datos del seed');
  return { sucCentro, sucSlo, insumo };
}

async function cleanupTransferencias() {
  const transfers = await prisma.transferenciaStock.findMany({
    where: { notas: { startsWith: 'TEST_' } },
    select: { id: true },
  });
  if (transfers.length > 0) {
    const ids = transfers.map((t) => t.id);
    await prisma.movimientoStock.deleteMany({ where: { transferenciaId: { in: ids } } });
    await prisma.itemTransferencia.deleteMany({ where: { transferenciaId: { in: ids } } });
    await prisma.transferenciaStock.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(cleanupTransferencias);
afterAll(cleanupTransferencias);

describe('POST /transferencias', () => {
  it('cajero NO puede transferir → 403', async () => {
    const token = await login(CAJERO);
    const { sucCentro, sucSlo, insumo } = await getRefs();
    const res = await request(app)
      .post('/transferencias')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sucursalOrigenId: sucCentro.id,
        sucursalDestinoId: sucSlo.id,
        items: [{ productoInventarioId: insumo.id, cantidad: 1 }],
      });
    expect(res.status).toBe(403);
  });

  it('admin transfiere y mueve stock origen → destino', async () => {
    await cleanupTransferencias();
    const token = await login(ADMIN);
    const { sucCentro, sucSlo, insumo } = await getRefs();

    async function getStock(sucursalId: string) {
      const s = await prisma.stockSucursal.findUnique({
        where: {
          productoInventarioId_sucursalId: {
            productoInventarioId: insumo.id,
            sucursalId,
          },
        },
      });
      return Number(s?.stockActual ?? 0);
    }
    const cantidad = 5;
    const origenAntes = await getStock(sucCentro.id);
    const destinoAntes = await getStock(sucSlo.id);

    const res = await request(app)
      .post('/transferencias')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sucursalOrigenId: sucCentro.id,
        sucursalDestinoId: sucSlo.id,
        notas: 'TEST_TRANSF_001',
        items: [{ productoInventarioId: insumo.id, cantidad }],
      });

    expect(res.status).toBe(201);
    expect(res.body.transferencia.estado).toBe('RECIBIDA');
    expect(res.body.transferencia.numero).toBeGreaterThan(0);

    expect(await getStock(sucCentro.id)).toBe(origenAntes - cantidad);
    expect(await getStock(sucSlo.id)).toBe(destinoAntes + cantidad);

    // Dos movimientos: SALIDA en origen + ENTRADA en destino
    const movs = await prisma.movimientoStock.findMany({
      where: { transferenciaId: res.body.transferencia.id },
      orderBy: { tipo: 'asc' },
    });
    expect(movs.length).toBe(2);
    const tipos = movs.map((m) => m.tipo).sort();
    expect(tipos).toEqual(['ENTRADA_TRANSFERENCIA', 'SALIDA_TRANSFERENCIA']);
  });

  it('rechaza origen = destino → 400', async () => {
    const token = await login(ADMIN);
    const { sucCentro, insumo } = await getRefs();
    const res = await request(app)
      .post('/transferencias')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sucursalOrigenId: sucCentro.id,
        sucursalDestinoId: sucCentro.id,
        items: [{ productoInventarioId: insumo.id, cantidad: 1 }],
      });
    expect(res.status).toBe(400);
  });

  it('rechaza items vacíos → 400', async () => {
    const token = await login(ADMIN);
    const { sucCentro, sucSlo } = await getRefs();
    const res = await request(app)
      .post('/transferencias')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sucursalOrigenId: sucCentro.id,
        sucursalDestinoId: sucSlo.id,
        items: [],
      });
    expect(res.status).toBe(400);
  });

  it('rechaza items duplicados → 409', async () => {
    const token = await login(ADMIN);
    const { sucCentro, sucSlo, insumo } = await getRefs();
    const res = await request(app)
      .post('/transferencias')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sucursalOrigenId: sucCentro.id,
        sucursalDestinoId: sucSlo.id,
        notas: 'TEST_DUP',
        items: [
          { productoInventarioId: insumo.id, cantidad: 1 },
          { productoInventarioId: insumo.id, cantidad: 2 },
        ],
      });
    expect(res.status).toBe(409);
  });
});

describe('GET /transferencias', () => {
  it('lista las transferencias del seed o creadas en este test', async () => {
    await cleanupTransferencias();
    const token = await login(ADMIN);
    const { sucCentro, sucSlo, insumo } = await getRefs();

    await request(app)
      .post('/transferencias')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sucursalOrigenId: sucCentro.id,
        sucursalDestinoId: sucSlo.id,
        notas: 'TEST_LIST',
        items: [{ productoInventarioId: insumo.id, cantidad: 1 }],
      });

    const res = await request(app).get('/transferencias').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.transferencias.length).toBeGreaterThanOrEqual(1);
  });

  it('filtra por sucursal destino', async () => {
    const token = await login(ADMIN);
    const { sucSlo } = await getRefs();
    const res = await request(app)
      .get(`/transferencias?sucursalDestinoId=${sucSlo.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    for (const t of res.body.transferencias as { sucursalDestino: { id: string } }[]) {
      expect(t.sucursalDestino.id).toBe(sucSlo.id);
    }
  });
});

describe('GET /transferencias/:id', () => {
  it('devuelve detalle con items, sucursales y nombres de usuarios', async () => {
    await cleanupTransferencias();
    const token = await login(ADMIN);
    const { sucCentro, sucSlo, insumo } = await getRefs();

    const create = await request(app)
      .post('/transferencias')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sucursalOrigenId: sucCentro.id,
        sucursalDestinoId: sucSlo.id,
        notas: 'TEST_DET',
        items: [{ productoInventarioId: insumo.id, cantidad: 2 }],
      });
    const id = create.body.transferencia.id;

    const res = await request(app)
      .get(`/transferencias/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.transferencia.items.length).toBe(1);
    expect(res.body.transferencia.solicitadoPorNombre).toBeTruthy();
    expect(res.body.transferencia.recibidoPorNombre).toBeTruthy();
  });
});
