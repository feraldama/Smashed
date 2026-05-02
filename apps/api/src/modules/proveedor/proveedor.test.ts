/**
 * Tests del módulo proveedor.
 */
import { calcularDvRuc } from '@smash/shared-utils';
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

describe('GET /proveedores', () => {
  it('cajero NO puede listar → 403', async () => {
    const token = await login(CAJERO);
    const res = await request(app).get('/proveedores').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin lista los 4 del seed', async () => {
    const token = await login(ADMIN);
    const res = await request(app).get('/proveedores').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.proveedores.length).toBeGreaterThanOrEqual(4);
  });

  it('busca por razón social', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .get('/proveedores?busqueda=COCA')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.proveedores[0].razonSocial.toUpperCase()).toContain('COCA');
  });
});

describe('POST /proveedores', () => {
  it('crea OK + previene duplicado por RUC', async () => {
    const token = await login(ADMIN);
    const ruc = '80077777';
    const dv = String(calcularDvRuc(ruc));
    const r1 = await request(app)
      .post('/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ razonSocial: 'PROV TEST S.A.', ruc, dv, contacto: 'Juan Test' });
    expect(r1.status).toBe(201);
    const id = r1.body.proveedor.id as string;

    const r2 = await request(app)
      .post('/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ razonSocial: 'OTRO', ruc, dv });
    expect(r2.status).toBe(409);

    await prisma.proveedor.delete({ where: { id } });
  });

  it('rechaza DV incorrecto → 400', async () => {
    const token = await login(ADMIN);
    const ruc = '80077778';
    const dvCorrecto = calcularDvRuc(ruc);
    const dvMal = String((dvCorrecto + 3) % 10);
    const res = await request(app)
      .post('/proveedores')
      .set('Authorization', `Bearer ${token}`)
      .send({ razonSocial: 'X', ruc, dv: dvMal });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /proveedores/:id', () => {
  it('actualiza contacto + telefono', async () => {
    const token = await login(ADMIN);
    const prov = await prisma.proveedor.create({
      data: {
        empresaId: (await prisma.empresa.findFirstOrThrow()).id,
        razonSocial: 'TMP PROV',
      },
    });

    const res = await request(app)
      .patch(`/proveedores/${prov.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contacto: 'María García', telefono: '+595 21 999 999' });
    expect(res.status).toBe(200);
    expect(res.body.proveedor.contacto).toBe('María García');

    await prisma.proveedor.delete({ where: { id: prov.id } });
  });
});

describe('DELETE /proveedores/:id', () => {
  it('soft delete OK si no tiene insumos asociados', async () => {
    const token = await login(ADMIN);
    const prov = await prisma.proveedor.create({
      data: {
        empresaId: (await prisma.empresa.findFirstOrThrow()).id,
        razonSocial: 'TMP DEL',
      },
    });

    const res = await request(app)
      .delete(`/proveedores/${prov.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    const después = await prisma.proveedor.findUnique({ where: { id: prov.id } });
    expect(después?.deletedAt).not.toBeNull();

    await prisma.proveedor.delete({ where: { id: prov.id } });
  });

  it('rechaza si tiene insumos asociados → 409', async () => {
    const token = await login(ADMIN);
    const prov = await prisma.proveedor.findFirstOrThrow({
      where: { razonSocial: 'CARNES DEL CHACO S.A.' },
    });
    const res = await request(app)
      .delete(`/proveedores/${prov.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});
