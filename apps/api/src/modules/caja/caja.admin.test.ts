/**
 * Tests del CRUD admin de cajas (POST/PATCH/DELETE /cajas).
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

async function getSucursal(codigo: 'CEN' | 'SLO') {
  const s = await prisma.sucursal.findFirst({ where: { codigo } });
  if (!s) throw new Error(`Sucursal ${codigo} no encontrada`);
  return s;
}

async function cleanupTestCajas() {
  await prisma.caja.deleteMany({ where: { nombre: { startsWith: 'TEST_' } } });
}

beforeAll(cleanupTestCajas);
afterAll(cleanupTestCajas);

describe('POST /cajas (admin)', () => {
  it('cajero NO puede crear → 403', async () => {
    const token = await login(CAJERO);
    const sucursal = await getSucursal('CEN');
    const res = await request(app)
      .post('/cajas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: sucursal.id, nombre: 'TEST_HACK' });
    expect(res.status).toBe(403);
  });

  it('admin crea caja en su sucursal', async () => {
    await cleanupTestCajas();
    const token = await login(ADMIN);
    const sucursal = await getSucursal('CEN');
    const res = await request(app)
      .post('/cajas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: sucursal.id, nombre: 'TEST_NUEVA' });
    expect(res.status).toBe(201);
    expect(res.body.caja.nombre).toBe('TEST_NUEVA');
    expect(res.body.caja.estado).toBe('CERRADA');
    expect(res.body.caja.activa).toBe(true);
  });

  it('rechaza nombre duplicado en la misma sucursal → 409', async () => {
    await cleanupTestCajas();
    const token = await login(ADMIN);
    const sucursal = await getSucursal('CEN');
    await request(app)
      .post('/cajas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: sucursal.id, nombre: 'TEST_DUP' });
    const r = await request(app)
      .post('/cajas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: sucursal.id, nombre: 'TEST_DUP' });
    expect(r.status).toBe(409);
  });

  it('rechaza puntoExpedicion de otra sucursal → 409', async () => {
    await cleanupTestCajas();
    const token = await login(ADMIN);
    const cen = await getSucursal('CEN');
    const slo = await getSucursal('SLO');
    const peSlo = await prisma.puntoExpedicion.findFirst({ where: { sucursalId: slo.id } });
    if (!peSlo) return; // skip si seed no lo tiene
    const res = await request(app).post('/cajas').set('Authorization', `Bearer ${token}`).send({
      sucursalId: cen.id,
      nombre: 'TEST_PE_INVALID',
      puntoExpedicionId: peSlo.id,
    });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /cajas/:id', () => {
  it('admin renombra caja', async () => {
    await cleanupTestCajas();
    const token = await login(ADMIN);
    const sucursal = await getSucursal('CEN');
    const create = await request(app)
      .post('/cajas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: sucursal.id, nombre: 'TEST_EDIT' });
    const id = create.body.caja.id;
    const res = await request(app)
      .patch(`/cajas/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'TEST_EDIT_RENAMED' });
    expect(res.status).toBe(200);
    expect(res.body.caja.nombre).toBe('TEST_EDIT_RENAMED');
  });
});

describe('DELETE /cajas/:id', () => {
  it('soft-deletea caja sin sesión activa', async () => {
    await cleanupTestCajas();
    const token = await login(ADMIN);
    const sucursal = await getSucursal('CEN');
    const create = await request(app)
      .post('/cajas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: sucursal.id, nombre: 'TEST_BORRABLE' });
    const id = create.body.caja.id;
    const res = await request(app).delete(`/cajas/${id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    const after = await prisma.caja.findUnique({ where: { id } });
    expect(after?.activa).toBe(false);
  });

  it('rechaza eliminar caja con sesión abierta → 409', async () => {
    await cleanupTestCajas();
    const token = await login(ADMIN);
    const sucursal = await getSucursal('CEN');
    const create = await request(app)
      .post('/cajas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: sucursal.id, nombre: 'TEST_OCUPADA' });
    const id = create.body.caja.id;

    // Marcar como ABIERTA + crear apertura sin cierre directamente en DB
    const adminUser = await prisma.usuario.findFirst({ where: { email: ADMIN.email } });
    if (!adminUser) throw new Error('Admin no encontrado');
    await prisma.caja.update({ where: { id }, data: { estado: 'ABIERTA' } });
    const apertura = await prisma.aperturaCaja.create({
      data: { cajaId: id, usuarioId: adminUser.id, montoInicial: BigInt(0) },
    });

    const res = await request(app).delete(`/cajas/${id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);

    // Cleanup
    await prisma.aperturaCaja.delete({ where: { id: apertura.id } });
    await prisma.caja.update({ where: { id }, data: { estado: 'CERRADA' } });
  });
});

describe('GET /cajas?incluirInactivas=true', () => {
  it('incluye cajas inactivas cuando se pide', async () => {
    await cleanupTestCajas();
    const token = await login(ADMIN);
    const sucursal = await getSucursal('CEN');
    // Crear y borrar (soft) una caja
    const create = await request(app)
      .post('/cajas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: sucursal.id, nombre: 'TEST_INACTIVA' });
    await request(app)
      .delete(`/cajas/${create.body.caja.id}`)
      .set('Authorization', `Bearer ${token}`);

    // Sin flag → no debería aparecer
    const sinFlag = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    const cajasSinFlag = sinFlag.body.cajas as { nombre: string }[];
    expect(cajasSinFlag.find((c) => c.nombre === 'TEST_INACTIVA')).toBeUndefined();

    // Con flag → debería aparecer
    const conFlag = await request(app)
      .get('/cajas?incluirInactivas=true')
      .set('Authorization', `Bearer ${token}`);
    const cajasConFlag = conFlag.body.cajas as { nombre: string; activa: boolean }[];
    const inactiva = cajasConFlag.find((c) => c.nombre === 'TEST_INACTIVA');
    expect(inactiva).toBeDefined();
    expect(inactiva?.activa).toBe(false);
  });
});
