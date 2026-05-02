/**
 * Tests del módulo mesa — CRUD de zonas y mesas.
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

async function getSucursalCentroId() {
  const s = await prisma.sucursal.findFirst({ where: { codigo: 'CEN' } });
  if (!s) throw new Error('Sucursal CEN no encontrada en seed');
  return s.id;
}

async function cleanupZonas() {
  await prisma.mesa.deleteMany({ where: { zona: { nombre: { startsWith: 'TEST_' } } } });
  await prisma.zonaMesa.deleteMany({ where: { nombre: { startsWith: 'TEST_' } } });
}

beforeAll(cleanupZonas);
afterAll(cleanupZonas);

// ═══════════════════════════════════════════════════════════════════════════
//  ZONAS
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /mesas/zonas', () => {
  it('admin crea zona OK', async () => {
    await cleanupZonas();
    const token = await login(ADMIN);
    const sucursalId = await getSucursalCentroId();
    const res = await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId, nombre: 'TEST_ZONA_A', orden: 9 });
    expect(res.status).toBe(201);
    expect(res.body.zona.nombre).toBe('TEST_ZONA_A');
    expect(res.body.zona.orden).toBe(9);
  });

  it('rechaza zona duplicada en la misma sucursal → 409', async () => {
    await cleanupZonas();
    const token = await login(ADMIN);
    const sucursalId = await getSucursalCentroId();
    await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId, nombre: 'TEST_DUP' });
    const r = await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId, nombre: 'TEST_DUP' });
    expect(r.status).toBe(409);
  });

  it('cajero NO puede crear zona → 403', async () => {
    const token = await login(CAJERO);
    const sucursalId = await getSucursalCentroId();
    const res = await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId, nombre: 'TEST_HACK' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /mesas/zonas/:id', () => {
  it('admin renombra zona', async () => {
    await cleanupZonas();
    const token = await login(ADMIN);
    const sucursalId = await getSucursalCentroId();
    const create = await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId, nombre: 'TEST_ORIGINAL' });
    const id = create.body.zona.id;
    const res = await request(app)
      .patch(`/mesas/zonas/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'TEST_RENAMED', orden: 5 });
    expect(res.status).toBe(200);
    expect(res.body.zona.nombre).toBe('TEST_RENAMED');
    expect(res.body.zona.orden).toBe(5);
  });
});

describe('DELETE /mesas/zonas/:id', () => {
  it('elimina zona vacía OK', async () => {
    await cleanupZonas();
    const token = await login(ADMIN);
    const sucursalId = await getSucursalCentroId();
    const create = await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId, nombre: 'TEST_BORRABLE' });
    const id = create.body.zona.id;
    const res = await request(app)
      .delete(`/mesas/zonas/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('rechaza eliminar zona con mesas → 409', async () => {
    await cleanupZonas();
    const token = await login(ADMIN);
    const sucursalId = await getSucursalCentroId();
    const zona = await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId, nombre: 'TEST_CON_MESA' });
    await request(app)
      .post('/mesas')
      .set('Authorization', `Bearer ${token}`)
      .send({ zonaMesaId: zona.body.zona.id, numero: 1 });
    const res = await request(app)
      .delete(`/mesas/zonas/${zona.body.zona.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  MESAS
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /mesas', () => {
  it('admin crea mesa OK con capacidad default 4', async () => {
    await cleanupZonas();
    const token = await login(ADMIN);
    const sucursalId = await getSucursalCentroId();
    const zona = await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId, nombre: 'TEST_MESAS_A' });
    const res = await request(app)
      .post('/mesas')
      .set('Authorization', `Bearer ${token}`)
      .send({ zonaMesaId: zona.body.zona.id, numero: 42 });
    expect(res.status).toBe(201);
    expect(res.body.mesa.numero).toBe(42);
    expect(res.body.mesa.capacidad).toBe(4);
  });

  it('rechaza número duplicado en la misma zona → 409', async () => {
    await cleanupZonas();
    const token = await login(ADMIN);
    const sucursalId = await getSucursalCentroId();
    const zona = await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId, nombre: 'TEST_DUP_NUM' });
    await request(app)
      .post('/mesas')
      .set('Authorization', `Bearer ${token}`)
      .send({ zonaMesaId: zona.body.zona.id, numero: 7 });
    const r = await request(app)
      .post('/mesas')
      .set('Authorization', `Bearer ${token}`)
      .send({ zonaMesaId: zona.body.zona.id, numero: 7 });
    expect(r.status).toBe(409);
  });

  it('cajero NO puede crear mesa → 403', async () => {
    await cleanupZonas();
    const adminToken = await login(ADMIN);
    const sucursalId = await getSucursalCentroId();
    const zona = await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sucursalId, nombre: 'TEST_CAJ_HACK' });

    const cajToken = await login(CAJERO);
    const res = await request(app)
      .post('/mesas')
      .set('Authorization', `Bearer ${cajToken}`)
      .send({ zonaMesaId: zona.body.zona.id, numero: 99 });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /mesas/:id', () => {
  it('admin actualiza capacidad y número', async () => {
    await cleanupZonas();
    const token = await login(ADMIN);
    const sucursalId = await getSucursalCentroId();
    const zona = await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId, nombre: 'TEST_EDIT_M' });
    const create = await request(app)
      .post('/mesas')
      .set('Authorization', `Bearer ${token}`)
      .send({ zonaMesaId: zona.body.zona.id, numero: 1, capacidad: 4 });
    const id = create.body.mesa.id;

    const res = await request(app)
      .patch(`/mesas/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ numero: 2, capacidad: 8 });
    expect(res.status).toBe(200);
    expect(res.body.mesa.numero).toBe(2);
    expect(res.body.mesa.capacidad).toBe(8);
  });

  it('rechaza mover a zona de otra sucursal → 409', async () => {
    await cleanupZonas();
    const token = await login(ADMIN);
    const sucursalCentroId = await getSucursalCentroId();
    const otraSuc = await prisma.sucursal.findFirst({ where: { codigo: 'SLO' } });
    if (!otraSuc) return; // skip si seed no la tiene
    const zonaA = await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: sucursalCentroId, nombre: 'TEST_SUC_A' });
    const zonaB = await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: otraSuc.id, nombre: 'TEST_SUC_B' });
    const mesa = await request(app)
      .post('/mesas')
      .set('Authorization', `Bearer ${token}`)
      .send({ zonaMesaId: zonaA.body.zona.id, numero: 1 });
    const res = await request(app)
      .patch(`/mesas/${mesa.body.mesa.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ zonaMesaId: zonaB.body.zona.id });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /mesas/:id', () => {
  it('elimina mesa OK si no tiene pedido activo', async () => {
    await cleanupZonas();
    const token = await login(ADMIN);
    const sucursalId = await getSucursalCentroId();
    const zona = await request(app)
      .post('/mesas/zonas')
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId, nombre: 'TEST_DEL_M' });
    const mesa = await request(app)
      .post('/mesas')
      .set('Authorization', `Bearer ${token}`)
      .send({ zonaMesaId: zona.body.zona.id, numero: 1 });
    const res = await request(app)
      .delete(`/mesas/${mesa.body.mesa.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});
