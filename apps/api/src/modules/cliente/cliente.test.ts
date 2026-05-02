/**
 * Tests del módulo cliente.
 */
import { calcularDvRuc } from '@smash/shared-utils';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';


import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' };
const CAJERO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };
const COCINA = { email: 'cocina1@smash.com.py', password: 'Smash123!' };

async function login(creds: { email: string; password: string }) {
  const res = await request(app).post('/auth/login').send(creds);
  return res.body.accessToken as string;
}

const limpiables: string[] = [];
async function cleanup() {
  if (limpiables.length === 0) return;
  await prisma.direccionCliente.deleteMany({ where: { clienteId: { in: limpiables } } });
  await prisma.cliente.deleteMany({ where: { id: { in: limpiables } } });
  limpiables.length = 0;
}

describe('GET /clientes', () => {
  it('cocina no puede listar (rol no operativo) → 403', async () => {
    const token = await login(COCINA);
    const res = await request(app).get('/clientes').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('cajero lista clientes', async () => {
    const token = await login(CAJERO);
    const res = await request(app).get('/clientes').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.clientes)).toBe(true);
    // El "consumidor final" SIN NOMBRE viene primero
    expect(res.body.clientes[0].esConsumidorFinal).toBe(true);
    expect(res.body.clientes[0].razonSocial).toBe('SIN NOMBRE');
  });

  it('busca por nombre', async () => {
    const token = await login(CAJERO);
    const res = await request(app)
      .get('/clientes?busqueda=Andrea')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.clientes.length).toBeGreaterThanOrEqual(1);
    expect(res.body.clientes[0].razonSocial.toLowerCase()).toContain('andrea');
  });
});

describe('POST /clientes', () => {
  it('crea PERSONA_FISICA con CI', async () => {
    const token = await login(CAJERO);
    const res = await request(app).post('/clientes').set('Authorization', `Bearer ${token}`).send({
      tipoContribuyente: 'PERSONA_FISICA',
      razonSocial: 'Test Persona',
      documento: '9999999',
    });
    expect(res.status).toBe(201);
    expect(res.body.cliente.id).toBeDefined();
    limpiables.push(res.body.cliente.id);
  });

  it('crea PERSONA_JURIDICA con RUC válido', async () => {
    const token = await login(CAJERO);
    const ruc = '80055555';
    const dv = String(calcularDvRuc(ruc));
    const res = await request(app).post('/clientes').set('Authorization', `Bearer ${token}`).send({
      tipoContribuyente: 'PERSONA_JURIDICA',
      razonSocial: 'EMPRESA TEST S.A.',
      ruc,
      dv,
    });
    expect(res.status).toBe(201);
    expect(res.body.cliente.ruc).toBe(ruc);
    expect(res.body.cliente.dv).toBe(dv);
    limpiables.push(res.body.cliente.id);
  });

  it('rechaza RUC con DV incorrecto → 400', async () => {
    const token = await login(CAJERO);
    const ruc = '80055556';
    const dvCorrecto = calcularDvRuc(ruc);
    const dvIncorrecto = String((dvCorrecto + 1) % 10);
    const res = await request(app).post('/clientes').set('Authorization', `Bearer ${token}`).send({
      tipoContribuyente: 'PERSONA_JURIDICA',
      razonSocial: 'X',
      ruc,
      dv: dvIncorrecto,
    });
    expect(res.status).toBe(400);
  });

  it('rechaza RUC duplicado → 409', async () => {
    const token = await login(CAJERO);
    const ruc = '80055557';
    const dv = String(calcularDvRuc(ruc));
    const r1 = await request(app).post('/clientes').set('Authorization', `Bearer ${token}`).send({
      tipoContribuyente: 'PERSONA_JURIDICA',
      razonSocial: 'A',
      ruc,
      dv,
    });
    expect(r1.status).toBe(201);
    limpiables.push(r1.body.cliente.id);

    const r2 = await request(app)
      .post('/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipoContribuyente: 'PERSONA_JURIDICA', razonSocial: 'B', ruc, dv });
    expect(r2.status).toBe(409);
  });
});

describe('PATCH /clientes/:id', () => {
  it('actualiza datos OK', async () => {
    const token = await login(CAJERO);
    const c = await prisma.cliente.create({
      data: {
        empresaId: (await prisma.empresa.findFirstOrThrow()).id,
        tipoContribuyente: 'PERSONA_FISICA',
        razonSocial: 'Tmp',
        documento: '8888888',
      },
    });
    limpiables.push(c.id);

    const res = await request(app)
      .patch(`/clientes/${c.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ razonSocial: 'Renombrado', telefono: '+595 981 111 222' });
    expect(res.status).toBe(200);
    expect(res.body.cliente.razonSocial).toBe('Renombrado');
  });

  it('no permite modificar consumidor final → 409', async () => {
    const token = await login(CAJERO);
    const cf = await prisma.cliente.findFirstOrThrow({ where: { esConsumidorFinal: true } });
    const res = await request(app)
      .patch(`/clientes/${cf.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ razonSocial: 'OTRO NOMBRE' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /clientes/:id', () => {
  it('admin elimina cliente OK (soft delete)', async () => {
    const tokenAdmin = await login(ADMIN);
    const c = await prisma.cliente.create({
      data: {
        empresaId: (await prisma.empresa.findFirstOrThrow()).id,
        tipoContribuyente: 'PERSONA_FISICA',
        razonSocial: 'Tmp delete',
      },
    });

    const res = await request(app)
      .delete(`/clientes/${c.id}`)
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(204);

    const después = await prisma.cliente.findUnique({ where: { id: c.id } });
    expect(después?.deletedAt).not.toBeNull();

    await prisma.cliente.delete({ where: { id: c.id } });
  });

  it('cajero NO puede eliminar → 403', async () => {
    const token = await login(CAJERO);
    const cf = await prisma.cliente.findFirstOrThrow({ where: { esConsumidorFinal: true } });
    const res = await request(app)
      .delete(`/clientes/${cf.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Direcciones', () => {
  it('agrega + actualiza + elimina dirección, mantiene una sola principal', async () => {
    const token = await login(CAJERO);
    const c = await prisma.cliente.create({
      data: {
        empresaId: (await prisma.empresa.findFirstOrThrow()).id,
        tipoContribuyente: 'PERSONA_FISICA',
        razonSocial: 'Cliente con dirs',
      },
    });
    limpiables.push(c.id);

    // Agregar primera (esPrincipal: true)
    const d1 = await request(app)
      .post(`/clientes/${c.id}/direcciones`)
      .set('Authorization', `Bearer ${token}`)
      .send({ direccion: 'Av. Mariscal López 1234', ciudad: 'Asunción', esPrincipal: true });
    expect(d1.status).toBe(201);

    // Agregar segunda (esPrincipal: true) → primera deja de ser principal
    const d2 = await request(app)
      .post(`/clientes/${c.id}/direcciones`)
      .set('Authorization', `Bearer ${token}`)
      .send({ direccion: 'Av. España 567', alias: 'Oficina', esPrincipal: true });
    expect(d2.status).toBe(201);

    const dirs = await prisma.direccionCliente.findMany({ where: { clienteId: c.id } });
    const principales = dirs.filter((d) => d.esPrincipal);
    expect(principales.length).toBe(1);
    expect(principales[0]!.id).toBe(d2.body.direccion.id);

    // Eliminar la segunda
    const del = await request(app)
      .delete(`/clientes/${c.id}/direcciones/${d2.body.direccion.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);
  });
});

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});
