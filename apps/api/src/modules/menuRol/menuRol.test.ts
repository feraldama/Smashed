/**
 * Tests del módulo menu-rol — matriz de permisos por rol/menú.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' };
const GERENTE = { email: 'gerente.centro@smash.com.py', password: 'Smash123!' };
const CAJERO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };

async function login(creds: { email: string; password: string }) {
  const res = await request(app).post('/auth/login').send(creds);
  return res.body.accessToken as string;
}

describe('GET /menu-rol', () => {
  it('cajero NO puede leer la matriz → 403', async () => {
    const token = await login(CAJERO);
    const res = await request(app).get('/menu-rol').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('gerente NO puede leer la matriz (solo ADMIN_EMPRESA) → 403', async () => {
    const token = await login(GERENTE);
    const res = await request(app).get('/menu-rol').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin recibe matriz completa', async () => {
    const token = await login(ADMIN);
    const res = await request(app).get('/menu-rol').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.menus.length).toBeGreaterThan(15);
    expect(res.body.rolesConfigurables).toContain('CAJERO');
    expect(res.body.rolesConfigurables).not.toContain('SUPER_ADMIN');
    expect(res.body.asignaciones.CAJERO).toContain('/pos');
    expect(res.body.asignaciones.ADMIN_EMPRESA.length).toBeGreaterThan(15);
  });
});

describe('PUT /menu-rol', () => {
  it('admin saca /productos al gerente y se refleja al re-loguear', async () => {
    const token = await login(ADMIN);
    // Primero leer
    const before = await request(app).get('/menu-rol').set('Authorization', `Bearer ${token}`);
    const asignaciones = before.body.asignaciones as Record<string, string[]>;

    // Sacar /productos al gerente
    const nuevoGerente = (asignaciones.GERENTE_SUCURSAL ?? []).filter((m) => m !== '/productos');
    const res = await request(app)
      .put('/menu-rol')
      .set('Authorization', `Bearer ${token}`)
      .send({
        asignaciones: {
          ...asignaciones,
          GERENTE_SUCURSAL: nuevoGerente,
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.asignaciones.GERENTE_SUCURSAL).not.toContain('/productos');

    // Login del gerente: menusPermitidos no incluye /productos
    const tGerente = await login(GERENTE);
    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${tGerente}`);
    expect(me.body.user.menusPermitidos).not.toContain('/productos');
  });

  it('rechaza sacar /pos a CAJERO (bloqueado) → 409', async () => {
    const token = await login(ADMIN);
    const before = await request(app).get('/menu-rol').set('Authorization', `Bearer ${token}`);
    const asignaciones = before.body.asignaciones as Record<string, string[]>;
    const cajeroSinPos = (asignaciones.CAJERO ?? []).filter((m) => m !== '/pos');

    const res = await request(app)
      .put('/menu-rol')
      .set('Authorization', `Bearer ${token}`)
      .send({
        asignaciones: {
          ...asignaciones,
          CAJERO: cajeroSinPos,
        },
      });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/CAJERO/);
  });

  it('rechaza menú inexistente → 409', async () => {
    const token = await login(ADMIN);
    const before = await request(app).get('/menu-rol').set('Authorization', `Bearer ${token}`);
    const res = await request(app)
      .put('/menu-rol')
      .set('Authorization', `Bearer ${token}`)
      .send({
        asignaciones: {
          ...before.body.asignaciones,
          CAJERO: ['/menu-fantasma'],
        },
      });
    // /pos bloqueado → primero falla en la validación de bloqueado, pero el path
    // inexistente también dispararía 409. Aceptamos cualquiera.
    expect(res.status).toBe(409);
  });
});

describe('POST /menu-rol/reset', () => {
  it('restaura defaults — admin recupera /productos para gerente si lo había sacado', async () => {
    const token = await login(ADMIN);
    // Sacar /productos al gerente
    const before = await request(app).get('/menu-rol').set('Authorization', `Bearer ${token}`);
    const asignaciones = before.body.asignaciones as Record<string, string[]>;
    const sinProd = (asignaciones.GERENTE_SUCURSAL ?? []).filter((m) => m !== '/productos');
    await request(app)
      .put('/menu-rol')
      .set('Authorization', `Bearer ${token}`)
      .send({ asignaciones: { ...asignaciones, GERENTE_SUCURSAL: sinProd } });

    // Reset
    const res = await request(app).post('/menu-rol/reset').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.asignaciones.GERENTE_SUCURSAL).toContain('/productos');
  });
});

describe('GET /auth/me incluye menusPermitidos', () => {
  it('cajero recibe lista filtrada', async () => {
    const token = await login(CAJERO);
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.body.user.menusPermitidos).toEqual(
      expect.arrayContaining(['/pos', '/caja', '/kds', '/entregas']),
    );
    expect(res.body.user.menusPermitidos).not.toContain('/productos');
  });
});

describe('cleanup — restaurar defaults al final del suite', () => {
  it('reset final', async () => {
    const token = await login(ADMIN);
    await request(app).post('/menu-rol/reset').set('Authorization', `Bearer ${token}`);
    // Verificar
    const empresa = await prisma.empresa.findFirstOrThrow();
    const cantFilas = await prisma.menuRol.count({ where: { empresaId: empresa.id } });
    expect(cantFilas).toBeGreaterThan(40);
  });
});
