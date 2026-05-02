/**
 * Tests del módulo usuarios.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' };
const SUPER = { email: 'superadmin@smash.local', password: 'Smash123!' };
const CAJERO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };

async function login(creds: { email: string; password: string }) {
  const res = await request(app).post('/auth/login').send(creds);
  if (res.status !== 200) throw new Error(`login fallido: ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

async function cleanup() {
  // Borrar usuarios creados durante tests (los que no son del seed)
  await prisma.usuario.deleteMany({
    where: { email: { contains: '+test-' } },
  });
}

describe('GET /usuarios', () => {
  it('admin lista usuarios de su empresa', async () => {
    const token = await login(ADMIN);
    const res = await request(app).get('/usuarios').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.usuarios)).toBe(true);
    expect(res.body.usuarios.length).toBeGreaterThan(0);
    // No incluye al super_admin (otra empresa / null)
    const correos = res.body.usuarios.map((u: { email: string }) => u.email);
    expect(correos).toContain('admin@smash.com.py');
    expect(correos).not.toContain('superadmin@smash.local');
  });

  it('super_admin ve todos', async () => {
    const token = await login(SUPER);
    const res = await request(app).get('/usuarios').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const correos = res.body.usuarios.map((u: { email: string }) => u.email);
    expect(correos).toContain('superadmin@smash.local');
    expect(correos).toContain('admin@smash.com.py');
  });

  it('cajero NO puede listar → 403', async () => {
    const token = await login(CAJERO);
    const res = await request(app).get('/usuarios').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('filtra por rol', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .get('/usuarios?rol=CAJERO')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.usuarios.every((u: { rol: string }) => u.rol === 'CAJERO')).toBe(true);
  });

  it('busca por nombre o email', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .get('/usuarios?busqueda=cajero1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.usuarios.length).toBeGreaterThan(0);
    expect(res.body.usuarios[0].email).toContain('cajero1');
  });
});

describe('POST /usuarios', () => {
  it('admin crea CAJERO con sucursales asignadas', async () => {
    await cleanup();
    const token = await login(ADMIN);
    const sucursales = await prisma.sucursal.findMany({ select: { id: true, nombre: true } });
    const centro = sucursales.find((s) => s.nombre === 'Asunción Centro')!;

    const res = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'nuevo+test-1@smash.com.py',
        password: 'Smash999X',
        nombreCompleto: 'Nuevo Cajero',
        rol: 'CAJERO',
        sucursales: [{ sucursalId: centro.id, esPrincipal: true }],
      });
    expect(res.status).toBe(201);
    expect(res.body.usuario.email).toBe('nuevo+test-1@smash.com.py');
    expect(res.body.usuario.rol).toBe('CAJERO');
    expect(res.body.usuario.sucursales.length).toBe(1);
    expect(res.body.usuario.sucursales[0].esPrincipal).toBe(true);
    // No expone passwordHash
    expect(res.body.usuario.passwordHash).toBeUndefined();
  });

  it('rechaza password débil → 400', async () => {
    const token = await login(ADMIN);
    const res = await request(app).post('/usuarios').set('Authorization', `Bearer ${token}`).send({
      email: 'debil+test-1@smash.com.py',
      password: 'corta',
      nombreCompleto: 'X',
      rol: 'CAJERO',
      sucursales: [],
    });
    expect(res.status).toBe(400);
  });

  it('rechaza email duplicado → 409', async () => {
    await cleanup();
    const token = await login(ADMIN);
    const body = {
      email: 'dup+test-1@smash.com.py',
      password: 'Smash999X',
      nombreCompleto: 'Test Dup',
      rol: 'CAJERO',
      sucursales: [],
    };
    await request(app).post('/usuarios').set('Authorization', `Bearer ${token}`).send(body);
    const res = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(res.status).toBe(409);
  });

  it('admin NO puede crear SUPER_ADMIN → 403', async () => {
    const token = await login(ADMIN);
    const res = await request(app).post('/usuarios').set('Authorization', `Bearer ${token}`).send({
      email: 'super+test-1@smash.com.py',
      password: 'Smash999X',
      nombreCompleto: 'Wannabe Super',
      rol: 'SUPER_ADMIN',
      sucursales: [],
    });
    expect(res.status).toBe(403);
  });

  it('rechaza sucursal de otra empresa', async () => {
    const token = await login(ADMIN);
    // Como solo hay una empresa en el seed, no podemos probar exhaustivo;
    // pero sí podemos pasar un ID inexistente.
    const res = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'mal+test-1@smash.com.py',
        password: 'Smash999X',
        nombreCompleto: 'X',
        rol: 'CAJERO',
        sucursales: [{ sucursalId: 'cl000000000000000000000000', esPrincipal: false }],
      });
    expect(res.status).toBe(400);
  });

  it('rechaza más de una sucursal principal', async () => {
    const token = await login(ADMIN);
    const sucursales = await prisma.sucursal.findMany({ select: { id: true } });
    if (sucursales.length < 2) return; // skip si solo hay una
    const res = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: '2princ+test-1@smash.com.py',
        password: 'Smash999X',
        nombreCompleto: 'X',
        rol: 'CAJERO',
        sucursales: [
          { sucursalId: sucursales[0]!.id, esPrincipal: true },
          { sucursalId: sucursales[1]!.id, esPrincipal: true },
        ],
      });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /usuarios/:id', () => {
  it('admin actualiza nombre y telefono de un usuario', async () => {
    await cleanup();
    const token = await login(ADMIN);
    const create = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'edit+test-1@smash.com.py',
        password: 'Smash999X',
        nombreCompleto: 'Original',
        rol: 'MESERO',
        sucursales: [],
      });
    const id = create.body.usuario.id;

    const res = await request(app)
      .patch(`/usuarios/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombreCompleto: 'Editado', telefono: '+595 981 000 000' });
    expect(res.status).toBe(200);
    expect(res.body.usuario.nombreCompleto).toBe('Editado');
    expect(res.body.usuario.telefono).toBe('+595 981 000 000');
  });

  it('no permite auto-desactivarse → 409', async () => {
    const token = await login(ADMIN);
    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
    const myId = me.body.user.id;
    const res = await request(app)
      .patch(`/usuarios/${myId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activo: false });
    expect(res.status).toBe(409);
  });

  it('reemplaza sucursales (set, no merge)', async () => {
    await cleanup();
    const token = await login(ADMIN);
    const sucursales = await prisma.sucursal.findMany({ select: { id: true } });

    const create = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'sucs+test-1@smash.com.py',
        password: 'Smash999X',
        nombreCompleto: 'Test',
        rol: 'CAJERO',
        sucursales: [{ sucursalId: sucursales[0]!.id, esPrincipal: true }],
      });
    const id = create.body.usuario.id;

    // Reemplazar por otra sucursal
    if (sucursales.length >= 2) {
      const res = await request(app)
        .patch(`/usuarios/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          sucursales: [{ sucursalId: sucursales[1]!.id, esPrincipal: true }],
        });
      expect(res.status).toBe(200);
      expect(res.body.usuario.sucursales).toHaveLength(1);
      expect(res.body.usuario.sucursales[0].sucursalId).toBe(sucursales[1]!.id);
    }
  });
});

describe('POST /usuarios/:id/reset-password', () => {
  it('admin resetea password de cajero y revoca refresh tokens', async () => {
    await cleanup();
    const adminToken = await login(ADMIN);

    const create = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'reset+test-1@smash.com.py',
        password: 'Smash999X',
        nombreCompleto: 'Test Reset',
        rol: 'CAJERO',
        sucursales: [],
      });
    const id = create.body.usuario.id;

    // Login con la password original — emite refresh token
    const login1 = await request(app)
      .post('/auth/login')
      .send({ email: 'reset+test-1@smash.com.py', password: 'Smash999X' });
    expect(login1.status).toBe(200);

    // Admin resetea password
    const reset = await request(app)
      .post(`/usuarios/${id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'OtraPass123' });
    expect(reset.status).toBe(200);

    // Password vieja ya no funciona
    const oldLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'reset+test-1@smash.com.py', password: 'Smash999X' });
    expect(oldLogin.status).toBe(401);

    // Password nueva sí
    const newLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'reset+test-1@smash.com.py', password: 'OtraPass123' });
    expect(newLogin.status).toBe(200);

    // Refresh tokens previos revocados
    const tokens = await prisma.refreshToken.findMany({
      where: { usuarioId: id, revocadoEn: null },
    });
    expect(tokens.length).toBeLessThanOrEqual(1); // solo el del newLogin
  });
});

describe('DELETE /usuarios/:id', () => {
  it('admin soft-elimina cajero', async () => {
    await cleanup();
    const token = await login(ADMIN);
    const create = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'del+test-1@smash.com.py',
        password: 'Smash999X',
        nombreCompleto: 'Test Del',
        rol: 'CAJERO',
        sucursales: [],
      });
    const id = create.body.usuario.id;

    const res = await request(app)
      .delete(`/usuarios/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    // Soft-deleted: no aparece en listado por default
    const list = await request(app).get('/usuarios').set('Authorization', `Bearer ${token}`);
    const ids = list.body.usuarios.map((u: { id: string }) => u.id);
    expect(ids).not.toContain(id);

    // Login bloqueado
    const tryLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'del+test-1@smash.com.py', password: 'Smash999X' });
    expect(tryLogin.status).toBe(401);
  });

  it('no permite auto-eliminarse → 409', async () => {
    const token = await login(ADMIN);
    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
    const res = await request(app)
      .delete(`/usuarios/${me.body.user.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});
