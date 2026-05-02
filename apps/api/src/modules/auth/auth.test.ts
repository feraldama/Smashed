/**
 * Tests de integración de auth + tenant context.
 * Asume que la BD `smash` ya está poblada por el seed.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' };
const CAJERO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };
const SUPER = { email: 'superadmin@smash.local', password: 'Smash123!' };

describe('POST /auth/login', () => {
  it('login OK retorna access token + user con sucursales', async () => {
    const res = await request(app).post('/auth/login').send(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user.email).toBe(ADMIN.email);
    expect(res.body.user.rol).toBe('ADMIN_EMPRESA');
    expect(res.body.user.sucursales).toHaveLength(2);
    expect(res.body.user.sucursalActivaId).toBeTruthy();

    const cookie = res.headers['set-cookie'];
    expect(cookie).toBeDefined();
    const cookieStr = Array.isArray(cookie) ? cookie.join('; ') : String(cookie);
    expect(cookieStr).toMatch(/smash_refresh=/);
    expect(cookieStr).toMatch(/HttpOnly/i);
  });

  it('login con password incorrecta retorna 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: ADMIN.email, password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('login con email inexistente retorna 401 (mismo error code para no leakear)', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'noexiste@smash.com.py', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('login con email inválido retorna 400 con detalles Zod', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'no-email', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fieldErrors.email).toBeDefined();
  });
});

describe('GET /auth/me', () => {
  it('sin token retorna 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('con access token válido retorna usuario', async () => {
    const login = await request(app).post('/auth/login').send(ADMIN);
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(ADMIN.email);
    expect(res.body.user.empresa).toBeTruthy();
    expect(res.body.sucursalActivaId).toBeTruthy();
  });

  it('con token corrupto retorna 401 TOKEN_INVALID', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', 'Bearer not.a.real.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });
});

describe('POST /auth/refresh', () => {
  it('rota el refresh token y emite uno nuevo', async () => {
    const login = await request(app).post('/auth/login').send(CAJERO);
    const cookie1 = extractCookie(login.headers['set-cookie'], 'smash_refresh');
    expect(cookie1).toBeTruthy();

    const refresh = await request(app)
      .post('/auth/refresh')
      .set('Cookie', `smash_refresh=${cookie1}`);
    expect(refresh.status).toBe(200);
    expect(refresh.body.accessToken).toBeTypeOf('string');

    const cookie2 = extractCookie(refresh.headers['set-cookie'], 'smash_refresh');
    expect(cookie2).toBeTruthy();
    expect(cookie2).not.toBe(cookie1); // rotación

    // Reusar el token VIEJO debe fallar y revocar la cadena (anti-reuse)
    const reuseAttempt = await request(app)
      .post('/auth/refresh')
      .set('Cookie', `smash_refresh=${cookie1}`);
    expect(reuseAttempt.status).toBe(401);
    expect(reuseAttempt.body.error.code).toBe('TOKEN_REVOKED');

    // El cookie2 (que era válido) ahora también está revocado (cadena revocada)
    const cookie2Attempt = await request(app)
      .post('/auth/refresh')
      .set('Cookie', `smash_refresh=${cookie2}`);
    expect(cookie2Attempt.status).toBe(401);
    expect(cookie2Attempt.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('sin cookie retorna 401', async () => {
    const res = await request(app).post('/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('preserva sucursalActivaId enviada como hint si el usuario tiene acceso', async () => {
    // ADMIN tiene acceso a Centro y San Lorenzo
    const login = await request(app).post('/auth/login').send(ADMIN);
    const cookie = extractCookie(login.headers['set-cookie'], 'smash_refresh');
    const sloId = (await prisma.sucursal.findFirstOrThrow({ where: { nombre: 'San Lorenzo' } })).id;

    const refresh = await request(app)
      .post('/auth/refresh')
      .set('Cookie', `smash_refresh=${cookie}`)
      .send({ sucursalActivaId: sloId });
    expect(refresh.status).toBe(200);
    expect(refresh.body.sucursalActivaId).toBe(sloId);
  });

  it('ignora hint si el usuario NO tiene acceso a esa sucursal', async () => {
    // CAJERO solo tiene acceso a Centro. Le pasamos San Lorenzo como hint.
    const login = await request(app).post('/auth/login').send(CAJERO);
    const cookie = extractCookie(login.headers['set-cookie'], 'smash_refresh');
    const sloId = (await prisma.sucursal.findFirstOrThrow({ where: { nombre: 'San Lorenzo' } })).id;
    const cenId = (await prisma.sucursal.findFirstOrThrow({ where: { nombre: 'Asunción Centro' } }))
      .id;

    const refresh = await request(app)
      .post('/auth/refresh')
      .set('Cookie', `smash_refresh=${cookie}`)
      .send({ sucursalActivaId: sloId });
    expect(refresh.status).toBe(200);
    expect(refresh.body.sucursalActivaId).toBe(cenId); // cae al default (su sucursal real)
  });

  it('sin hint cae al default (esPrincipal o primera)', async () => {
    const login = await request(app).post('/auth/login').send(CAJERO);
    const cookie = extractCookie(login.headers['set-cookie'], 'smash_refresh');

    const refresh = await request(app)
      .post('/auth/refresh')
      .set('Cookie', `smash_refresh=${cookie}`);
    expect(refresh.status).toBe(200);
    expect(refresh.body.sucursalActivaId).toBeTruthy();
  });
});

describe('POST /auth/logout', () => {
  it('revoca el refresh y limpia la cookie', async () => {
    const login = await request(app).post('/auth/login').send(CAJERO);
    const cookie = extractCookie(login.headers['set-cookie'], 'smash_refresh');

    const logout = await request(app).post('/auth/logout').set('Cookie', `smash_refresh=${cookie}`);
    expect(logout.status).toBe(200);

    // Después de logout el refresh ya no funciona
    const reuse = await request(app).post('/auth/refresh').set('Cookie', `smash_refresh=${cookie}`);
    expect(reuse.status).toBe(401);
  });
});

describe('POST /auth/seleccionar-sucursal', () => {
  it('cajero solo puede seleccionar su sucursal', async () => {
    // cajero1 → Centro. Le pedimos seleccionar San Lorenzo (no autorizado).
    const login = await request(app).post('/auth/login').send(CAJERO);
    const accessToken = login.body.accessToken;

    const sucursales = await prisma.sucursal.findMany({ select: { id: true, nombre: true } });
    const sloId = sucursales.find((s) => s.nombre === 'San Lorenzo')!.id;
    const cenId = sucursales.find((s) => s.nombre === 'Asunción Centro')!.id;

    const ataque = await request(app)
      .post('/auth/seleccionar-sucursal')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sucursalId: sloId });
    expect(ataque.status).toBe(403);
    expect(ataque.body.error.code).toBe('SUCURSAL_NO_AUTORIZADA');

    // Pero su propia sucursal sí
    const ok = await request(app)
      .post('/auth/seleccionar-sucursal')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sucursalId: cenId });
    expect(ok.status).toBe(200);
    expect(ok.body.sucursalActivaId).toBe(cenId);
    expect(ok.body.accessToken).toBeTypeOf('string');
  });

  it('admin de empresa puede seleccionar cualquiera de SUS sucursales', async () => {
    const login = await request(app).post('/auth/login').send(ADMIN);
    const accessToken = login.body.accessToken;

    const sucursales = await prisma.sucursal.findMany({ select: { id: true, nombre: true } });
    const sloId = sucursales.find((s) => s.nombre === 'San Lorenzo')!.id;

    const res = await request(app)
      .post('/auth/seleccionar-sucursal')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sucursalId: sloId });
    expect(res.status).toBe(200);
    expect(res.body.sucursalActivaId).toBe(sloId);
  });

  it('SUPER_ADMIN puede seleccionar cualquier sucursal aunque no esté linkeado', async () => {
    const login = await request(app).post('/auth/login').send(SUPER);
    const accessToken = login.body.accessToken;

    const sucursal = await prisma.sucursal.findFirst({ select: { id: true } });
    const res = await request(app)
      .post('/auth/seleccionar-sucursal')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sucursalId: sucursal!.id });
    expect(res.status).toBe(200);
  });

  it('seleccionar sucursalId inexistente con SUPER_ADMIN retorna 404', async () => {
    const login = await request(app).post('/auth/login').send(SUPER);
    const accessToken = login.body.accessToken;

    const res = await request(app)
      .post('/auth/seleccionar-sucursal')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sucursalId: 'cl000000000000000000000000' }); // CUID válido en formato pero inexistente
    expect(res.status).toBe(404);
  });
});

describe('GET /health', () => {
  it('retorna ok=true', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ───── helpers ─────

function extractCookie(
  setCookieHeader: string | string[] | undefined,
  name: string,
): string | null {
  if (!setCookieHeader) return null;
  const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const c of arr) {
    const m = new RegExp(`${name}=([^;]+)`).exec(c);
    if (m) return m[1] ?? null;
  }
  return null;
}
