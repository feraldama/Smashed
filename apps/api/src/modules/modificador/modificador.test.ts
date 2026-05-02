/**
 * Tests del módulo modificador — CRUD grupos + opciones + vinculación a productos.
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
  await prisma.modificadorOpcion.deleteMany({
    where: { modificadorGrupo: { nombre: { startsWith: 'TEST_' } } },
  });
  await prisma.productoVentaModificadorGrupo.deleteMany({
    where: { modificadorGrupo: { nombre: { startsWith: 'TEST_' } } },
  });
  await prisma.modificadorGrupo.deleteMany({
    where: { nombre: { startsWith: 'TEST_' } },
  });
}

beforeAll(cleanupTest);
afterAll(cleanupTest);

// ═══════════════════════════════════════════════════════════════════════════
//  GRUPOS
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /modificadores', () => {
  it('cajero NO puede listar → 403', async () => {
    const token = await login(CAJERO);
    const res = await request(app).get('/modificadores').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin lista los 3 grupos del seed', async () => {
    const token = await login(ADMIN);
    const res = await request(app).get('/modificadores').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.grupos.length).toBeGreaterThanOrEqual(3);
    const nombres = (res.body.grupos as { nombre: string }[]).map((g) => g.nombre);
    expect(nombres).toContain('Punto de cocción');
    expect(nombres).toContain('Extras');
  });

  it('busca por nombre', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .get('/modificadores?busqueda=Extras')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.grupos.length).toBe(1);
  });
});

describe('POST /modificadores', () => {
  it('admin crea grupo con opciones inline', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    const res = await request(app)
      .post('/modificadores')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'TEST_GRUPO_A',
        tipo: 'MULTIPLE',
        opciones: [
          { nombre: 'Op1', precioExtra: 1000 },
          { nombre: 'Op2', precioExtra: 2000 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.grupo.opciones.length).toBe(2);
    expect(res.body.grupo.opciones[0].precioExtra).toBe('1000');
  });

  it('rechaza nombre duplicado → 409', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    await request(app)
      .post('/modificadores')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'TEST_DUP' });
    const r = await request(app)
      .post('/modificadores')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'TEST_DUP' });
    expect(r.status).toBe(409);
  });

  it('rechaza obligatorio con minSeleccion=0 → 400', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .post('/modificadores')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'TEST_MIN_INVALID', obligatorio: true, minSeleccion: 0 });
    expect(res.status).toBe(400);
  });

  it('rechaza min > max → 400', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .post('/modificadores')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'TEST_MIN_MAX', minSeleccion: 5, maxSeleccion: 2 });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /modificadores/:id', () => {
  it('admin actualiza tipo y obligatorio', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    const create = await request(app)
      .post('/modificadores')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'TEST_EDIT' });
    const id = create.body.grupo.id;
    const res = await request(app)
      .patch(`/modificadores/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'UNICA', obligatorio: true, minSeleccion: 1, maxSeleccion: 1 });
    expect(res.status).toBe(200);
    expect(res.body.grupo.tipo).toBe('UNICA');
    expect(res.body.grupo.obligatorio).toBe(true);
  });
});

describe('DELETE /modificadores/:id', () => {
  it('soft-deletea y desvincula productos', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    // Crear grupo con opciones y vincularlo a un producto del seed
    const create = await request(app)
      .post('/modificadores')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'TEST_BORRABLE',
        opciones: [{ nombre: 'X' }],
      });
    const grupoId = create.body.grupo.id;

    const algunProd = await prisma.productoVenta.findFirst({
      where: { codigo: 'HAM-001' },
    });
    expect(algunProd).toBeTruthy();
    if (!algunProd) return;

    await request(app)
      .post(`/modificadores/${grupoId}/productos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ productoVentaId: algunProd.id, ordenEnProducto: 5 });

    const linksBefore = await prisma.productoVentaModificadorGrupo.count({
      where: { modificadorGrupoId: grupoId },
    });
    expect(linksBefore).toBe(1);

    const res = await request(app)
      .delete(`/modificadores/${grupoId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    // No aparece en listing
    const list = await request(app)
      .get('/modificadores?busqueda=TEST_BORRABLE')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.grupos.length).toBe(0);

    // Vínculo eliminado
    const linksAfter = await prisma.productoVentaModificadorGrupo.count({
      where: { modificadorGrupoId: grupoId },
    });
    expect(linksAfter).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  OPCIONES
// ═══════════════════════════════════════════════════════════════════════════

describe('POST/PATCH/DELETE /modificadores/:id/opciones', () => {
  it('crea opción nueva', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    const grupo = await request(app)
      .post('/modificadores')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'TEST_OPC_A' });
    const res = await request(app)
      .post(`/modificadores/${grupo.body.grupo.id}/opciones`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Nueva opc', precioExtra: 7500, orden: 3 });
    expect(res.status).toBe(201);
    expect(res.body.opcion.precioExtra).toBe('7500');
    expect(res.body.opcion.orden).toBe(3);
  });

  it('actualiza precio y desactiva', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    const grupo = await request(app)
      .post('/modificadores')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'TEST_OPC_B', opciones: [{ nombre: 'X' }] });
    const grupoId = grupo.body.grupo.id;
    const opcionId = grupo.body.grupo.opciones[0].id;

    const res = await request(app)
      .patch(`/modificadores/${grupoId}/opciones/${opcionId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ precioExtra: 9999, activo: false });
    expect(res.status).toBe(200);
    expect(res.body.opcion.precioExtra).toBe('9999');
    expect(res.body.opcion.activo).toBe(false);
  });

  it('elimina opción sin historial', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    const grupo = await request(app)
      .post('/modificadores')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'TEST_OPC_C', opciones: [{ nombre: 'Y' }] });
    const grupoId = grupo.body.grupo.id;
    const opcionId = grupo.body.grupo.opciones[0].id;

    const res = await request(app)
      .delete(`/modificadores/${grupoId}/opciones/${opcionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  VINCULACIÓN PRODUCTO ↔ GRUPO
// ═══════════════════════════════════════════════════════════════════════════

describe('POST/DELETE /modificadores/:id/productos/...', () => {
  it('vincula y desvincula un producto', async () => {
    await cleanupTest();
    const token = await login(ADMIN);
    const grupo = await request(app)
      .post('/modificadores')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'TEST_LINK' });
    const grupoId = grupo.body.grupo.id;

    const prod = await prisma.productoVenta.findFirst({ where: { codigo: 'HAM-001' } });
    if (!prod) throw new Error('Producto HAM-001 no encontrado en seed');

    // Vincular
    const r1 = await request(app)
      .post(`/modificadores/${grupoId}/productos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ productoVentaId: prod.id, ordenEnProducto: 7 });
    expect(r1.status).toBe(201);

    // Re-vincular (upsert) cambia el orden
    const r2 = await request(app)
      .post(`/modificadores/${grupoId}/productos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ productoVentaId: prod.id, ordenEnProducto: 9 });
    expect(r2.status).toBe(201);
    expect(r2.body.link.ordenEnProducto).toBe(9);

    // Desvincular
    const r3 = await request(app)
      .delete(`/modificadores/${grupoId}/productos/${prod.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(r3.status).toBe(204);

    // Re-desvincular → 404
    const r4 = await request(app)
      .delete(`/modificadores/${grupoId}/productos/${prod.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(r4.status).toBe(404);
  });
});
