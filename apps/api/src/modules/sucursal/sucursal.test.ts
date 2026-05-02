/**
 * Tests del módulo sucursal.
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

async function cleanupTest() {
  await prisma.sucursal.deleteMany({
    where: { codigo: { startsWith: 'TEST_' } },
  });
}

describe('GET /sucursales', () => {
  it('admin lista sucursales de su empresa', async () => {
    const token = await login(ADMIN);
    const res = await request(app).get('/sucursales').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.sucursales.length).toBeGreaterThanOrEqual(2);
    const nombres = res.body.sucursales.map((s: { nombre: string }) => s.nombre);
    expect(nombres).toContain('Asunción Centro');
  });

  it('cajero también puede listar (lo necesitan los selectores)', async () => {
    const token = await login(CAJERO);
    const res = await request(app).get('/sucursales').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /sucursales', () => {
  it('admin crea sucursal nueva', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    const res = await request(app)
      .post('/sucursales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Sucursal Test',
        codigo: 'TEST_NUEVA',
        establecimiento: '999',
        direccion: 'Av. Test 123',
        ciudad: 'Asunción',
      });
    expect(res.status).toBe(201);
    expect(res.body.sucursal.codigo).toBe('TEST_NUEVA');
    expect(res.body.sucursal.establecimiento).toBe('999');
  });

  it('rechaza código duplicado → 409', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    const body = {
      nombre: 'Dup1',
      codigo: 'TEST_DUP',
      establecimiento: '888',
      direccion: 'Calle Test 100',
    };
    await request(app).post('/sucursales').set('Authorization', `Bearer ${token}`).send(body);
    const res = await request(app)
      .post('/sucursales')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...body, establecimiento: '887' });
    expect(res.status).toBe(409);
  });

  it('rechaza establecimiento duplicado → 409', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    await request(app).post('/sucursales').set('Authorization', `Bearer ${token}`).send({
      nombre: 'Sucursal A',
      codigo: 'TEST_A',
      establecimiento: '777',
      direccion: 'Calle Test 100',
    });
    const res = await request(app)
      .post('/sucursales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Sucursal B',
        codigo: 'TEST_B',
        establecimiento: '777',
        direccion: 'Calle Test 200',
      });
    expect(res.status).toBe(409);
  });

  it('cajero NO puede crear → 403', async () => {
    const token = await login(CAJERO);
    const res = await request(app)
      .post('/sucursales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Hack',
        codigo: 'TEST_HACK',
        establecimiento: '666',
        direccion: 'Calle Test 100',
      });
    expect(res.status).toBe(403);
  });

  it('rechaza establecimiento con formato inválido', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .post('/sucursales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Bad Test',
        codigo: 'TEST_BAD',
        establecimiento: 'AB1', // no es 3 dígitos
        direccion: 'Calle Test 100',
      });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /sucursales/:id', () => {
  it('admin actualiza dirección', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    const create = await request(app)
      .post('/sucursales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Editable',
        codigo: 'TEST_EDIT',
        establecimiento: '555',
        direccion: 'Original',
      });
    const id = create.body.sucursal.id;

    const res = await request(app)
      .patch(`/sucursales/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ direccion: 'Editada' });
    expect(res.status).toBe(200);
    expect(res.body.sucursal.direccion).toBe('Editada');
  });

  it('puede desactivar sin eliminar', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    const create = await request(app)
      .post('/sucursales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Desact',
        codigo: 'TEST_DEACT',
        establecimiento: '444',
        direccion: 'Calle Test 100',
      });
    const id = create.body.sucursal.id;

    const res = await request(app)
      .patch(`/sucursales/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activa: false });
    expect(res.status).toBe(200);
    expect(res.body.sucursal.activa).toBe(false);
  });
});

describe('DELETE /sucursales/:id', () => {
  it('admin elimina sucursal sin comprobantes', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    const create = await request(app)
      .post('/sucursales')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Para Borrar',
        codigo: 'TEST_DEL',
        establecimiento: '333',
        direccion: 'Calle Test 100',
      });
    const id = create.body.sucursal.id;

    const res = await request(app)
      .delete(`/sucursales/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const list = await request(app).get('/sucursales').set('Authorization', `Bearer ${token}`);
    const ids = list.body.sucursales.map((s: { id: string }) => s.id);
    expect(ids).not.toContain(id);
  });

  it('rechaza eliminar sucursal con comprobantes (Centro tiene)', async () => {
    const token = await login(ADMIN);
    const list = await request(app).get('/sucursales').set('Authorization', `Bearer ${token}`);
    const centro = list.body.sucursales.find(
      (s: { nombre: string }) => s.nombre === 'Asunción Centro',
    );
    if (!centro) return;
    const tieneComprobantes = await prisma.comprobante.count({
      where: { sucursalId: centro.id },
    });
    if (tieneComprobantes === 0) {
      // No corremos el DELETE si no tiene comprobantes — borraría una sucursal
      // del seed y rompería los tests de inventario/reportes que dependen de ella.
      return;
    }
    const res = await request(app)
      .delete(`/sucursales/${centro.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

describe('GET /empresa/mi-empresa', () => {
  it('admin obtiene su empresa con configuración', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .get('/empresa/mi-empresa')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.empresa.razonSocial).toBeTruthy();
    expect(res.body.empresa.ruc).toBeTruthy();
    expect(res.body.empresa.configuracion).toBeTruthy();
    expect(typeof res.body.empresa.configuracion.permitirStockNegativo).toBe('boolean');
  });

  it('cajero también puede ver su empresa', async () => {
    const token = await login(CAJERO);
    const res = await request(app)
      .get('/empresa/mi-empresa')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /empresa/mi-empresa', () => {
  it('admin actualiza nombre fantasía y email', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .patch('/empresa/mi-empresa')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombreFantasia: 'Smash Burgers Test',
        email: 'test+smash@smash.com.py',
      });
    expect(res.status).toBe(200);
    expect(res.body.empresa.nombreFantasia).toBe('Smash Burgers Test');
    expect(res.body.empresa.email).toBe('test+smash@smash.com.py');
  });

  it('rechaza color hex inválido', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .patch('/empresa/mi-empresa')
      .set('Authorization', `Bearer ${token}`)
      .send({ colorPrimario: 'azul' });
    expect(res.status).toBe(400);
  });

  it('cajero NO puede actualizar → 403', async () => {
    const token = await login(CAJERO);
    const res = await request(app)
      .patch('/empresa/mi-empresa')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombreFantasia: 'Hack' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /empresa/mi-empresa/configuracion', () => {
  it('admin cambia permitirStockNegativo', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .patch('/empresa/mi-empresa/configuracion')
      .set('Authorization', `Bearer ${token}`)
      .send({ permitirStockNegativo: false });
    expect(res.status).toBe(200);
    expect(res.body.empresa.configuracion.permitirStockNegativo).toBe(false);

    // Revertir para no afectar otros tests
    await request(app)
      .patch('/empresa/mi-empresa/configuracion')
      .set('Authorization', `Bearer ${token}`)
      .send({ permitirStockNegativo: true });
  });
});

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await cleanupTest();
  await prisma.$disconnect();
});
