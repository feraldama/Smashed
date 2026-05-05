/**
 * Tests del módulo super-admin de empresas.
 * Asume BD `smash` poblada por el seed (depende de los usuarios super-admin
 * y admin que ya crea el seed). Crea una empresa nueva por test y la limpia
 * en afterEach para no contaminar el resto de la suite.
 */
import { calcularDvRuc } from '@smash/shared-utils';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../../app.js';
import { prisma } from '../../../lib/prisma.js';

const app = createApp();

const SUPER = { email: 'superadmin@smash.local', password: 'Smash123!' };
const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' }; // admin de empresa seed

// RUC ficticio único para los tests — no choca con el del seed (80012345).
const TEST_RUC = '99001234';
const TEST_DV = String(calcularDvRuc(TEST_RUC));

const empresasCreadasIds: string[] = [];

async function loginAsSuper() {
  const res = await request(app).post('/auth/login').send(SUPER);
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

function bodyEmpresaBase() {
  return {
    nombreFantasia: 'Empresa Test',
    razonSocial: 'EMPRESA TEST S.A.',
    ruc: TEST_RUC,
    dv: TEST_DV,
    admin: {
      email: 'admin-test@empresatest.com.py',
      nombreCompleto: 'Admin Test',
    },
  };
}

describe('POST /admin/empresas', () => {
  it('SUPER_ADMIN crea empresa + admin + seed mínimo y devuelve password generada', async () => {
    const token = await loginAsSuper();
    const res = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());

    expect(res.status).toBe(201);
    expect(res.body.empresa.id).toBeTypeOf('string');
    expect(res.body.empresa.ruc).toBe(TEST_RUC);
    expect(res.body.empresa.activa).toBe(true);
    expect(res.body.admin.email).toBe('admin-test@empresatest.com.py');
    expect(res.body.passwordInicial).toBeTypeOf('string');
    expect(res.body.passwordInicial.length).toBeGreaterThanOrEqual(12);
    empresasCreadasIds.push(res.body.empresa.id);

    // El admin recién creado puede loguearse con la password devuelta
    const login = await request(app).post('/auth/login').send({
      email: 'admin-test@empresatest.com.py',
      password: res.body.passwordInicial,
    });
    expect(login.status).toBe(200);
    expect(login.body.user.rol).toBe('ADMIN_EMPRESA');
    expect(login.body.user.empresaId).toBe(res.body.empresa.id);

    // Seed mínimo: cliente "consumidor final" + menús por rol
    const consumidorFinal = await prisma.cliente.findFirst({
      where: { empresaId: res.body.empresa.id, esConsumidorFinal: true },
    });
    expect(consumidorFinal).toBeTruthy();
    const menus = await prisma.menuRol.count({ where: { empresaId: res.body.empresa.id } });
    expect(menus).toBeGreaterThan(0);
  });

  it('rechaza con 409 si el RUC ya existe', async () => {
    const token = await loginAsSuper();
    await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase())
      .then((r) => empresasCreadasIds.push(r.body.empresa.id));

    const res = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...bodyEmpresaBase(), admin: { ...bodyEmpresaBase().admin, email: 'otro@x.com' } });
    expect(res.status).toBe(409);
  });

  it('rechaza con 400 si el DV no coincide con el RUC', async () => {
    const token = await loginAsSuper();
    const dvIncorrecto = String((Number.parseInt(TEST_DV, 10) + 1) % 10);
    const res = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...bodyEmpresaBase(), dv: dvIncorrecto });
    expect(res.status).toBe(400);
  });

  it('admin de empresa común recibe 403', async () => {
    const login = await request(app).post('/auth/login').send(ADMIN);
    const res = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send(bodyEmpresaBase());
    expect(res.status).toBe(403);
  });

  it('crea empresa + sucursal inicial + punto de expedición y asocia al admin', async () => {
    const token = await loginAsSuper();
    const res = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...bodyEmpresaBase(),
        sucursalInicial: {
          nombre: 'Sucursal Central',
          codigo: 'cen',
          establecimiento: '001',
          direccion: 'Av. España 1234',
          ciudad: 'Asunción',
        },
      });

    expect(res.status).toBe(201);
    const empresaId = res.body.empresa.id as string;
    empresasCreadasIds.push(empresaId);

    expect(res.body.sucursal).toBeTruthy();
    expect(res.body.sucursal.codigo).toBe('CEN'); // uppercase aplicado por el schema

    // Sucursal en BD con punto de expedición default
    const sucursales = await prisma.sucursal.findMany({
      where: { empresaId },
      include: { puntosExpedicion: true },
    });
    expect(sucursales).toHaveLength(1);
    const sucursal = sucursales[0];
    if (!sucursal) throw new Error('sucursal no creada');
    expect(sucursal.codigo).toBe('CEN');
    expect(sucursal.establecimiento).toBe('001');
    expect(sucursal.puntosExpedicion).toHaveLength(1);
    expect(sucursal.puntosExpedicion[0]?.codigo).toBe('001');

    // Admin asociado a la sucursal como principal
    const link = await prisma.usuarioSucursal.findFirst({
      where: { sucursalId: sucursal.id },
      include: { usuario: { select: { email: true, rol: true } } },
    });
    expect(link?.esPrincipal).toBe(true);
    expect(link?.usuario.email).toBe('admin-test@empresatest.com.py');
    expect(link?.usuario.rol).toBe('ADMIN_EMPRESA');

    // Login del admin nuevo: debe tener la sucursal como activa por default
    const login = await request(app).post('/auth/login').send({
      email: 'admin-test@empresatest.com.py',
      password: res.body.passwordInicial,
    });
    expect(login.status).toBe(200);
    expect(login.body.user.sucursales).toHaveLength(1);
    expect(login.body.user.sucursalActivaId).toBe(sucursal.id);
  });

  it('sin sucursalInicial el flujo sigue funcionando como antes', async () => {
    const token = await loginAsSuper();
    const res = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());
    expect(res.status).toBe(201);
    expect(res.body.sucursal).toBeNull();
    empresasCreadasIds.push(res.body.empresa.id);

    const count = await prisma.sucursal.count({ where: { empresaId: res.body.empresa.id } });
    expect(count).toBe(0);
  });

  it('rechaza sucursalInicial con establecimiento inválido (no 3 dígitos)', async () => {
    const token = await loginAsSuper();
    const res = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...bodyEmpresaBase(),
        sucursalInicial: {
          nombre: 'Sucursal',
          codigo: 'CEN',
          establecimiento: '01', // inválido
          direccion: 'Calle 123',
        },
      });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /admin/empresas/:id/activa', () => {
  it('desactivar guarda motivo+fecha y revoca refresh tokens vivos', async () => {
    const token = await loginAsSuper();

    // Crear empresa para suspender
    const created = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());
    const empresaId = created.body.empresa.id as string;
    empresasCreadasIds.push(empresaId);

    // El admin nuevo se loguea — esto crea un refresh token vivo
    const adminLogin = await request(app).post('/auth/login').send({
      email: 'admin-test@empresatest.com.py',
      password: created.body.passwordInicial,
    });
    expect(adminLogin.status).toBe(200);
    const adminUserId = adminLogin.body.user.id as string;
    const refreshActivos = await prisma.refreshToken.count({
      where: { usuarioId: adminUserId, revocadoEn: null },
    });
    expect(refreshActivos).toBe(1);

    // Suspender
    const patch = await request(app)
      .patch(`/admin/empresas/${empresaId}/activa`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activa: false, motivo: 'Falta de pago' });
    expect(patch.status).toBe(200);
    expect(patch.body.empresa.activa).toBe(false);
    expect(patch.body.empresa.motivoInactiva).toBe('Falta de pago');
    expect(patch.body.empresa.fechaInactivacion).toBeTruthy();

    // Refresh tokens del admin quedan revocados
    const vivosDespues = await prisma.refreshToken.count({
      where: { usuarioId: adminUserId, revocadoEn: null },
    });
    expect(vivosDespues).toBe(0);
  });

  it('reactivar limpia motivo y fecha', async () => {
    const token = await loginAsSuper();
    const created = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());
    const empresaId = created.body.empresa.id as string;
    empresasCreadasIds.push(empresaId);

    await request(app)
      .patch(`/admin/empresas/${empresaId}/activa`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activa: false, motivo: 'Mora' });

    const patch = await request(app)
      .patch(`/admin/empresas/${empresaId}/activa`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activa: true });
    expect(patch.status).toBe(200);
    expect(patch.body.empresa.activa).toBe(true);
    expect(patch.body.empresa.motivoInactiva).toBeNull();
    expect(patch.body.empresa.fechaInactivacion).toBeNull();
  });

  it('desactivar sin motivo retorna 400', async () => {
    const token = await loginAsSuper();
    const created = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());
    empresasCreadasIds.push(created.body.empresa.id);

    const res = await request(app)
      .patch(`/admin/empresas/${created.body.empresa.id}/activa`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activa: false });
    expect(res.status).toBe(400);
  });
});

describe('Auth gating con empresa inactiva', () => {
  it('login del admin de empresa suspendida retorna 403 EMPRESA_INACTIVA', async () => {
    const token = await loginAsSuper();
    const created = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());
    empresasCreadasIds.push(created.body.empresa.id);

    await request(app)
      .patch(`/admin/empresas/${created.body.empresa.id}/activa`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activa: false, motivo: 'Falta de pago' });

    const login = await request(app).post('/auth/login').send({
      email: 'admin-test@empresatest.com.py',
      password: created.body.passwordInicial,
    });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('EMPRESA_INACTIVA');
    expect(login.body.error.details?.motivo).toBe('Falta de pago');
  });

  it('refresh con empresa que pasa a inactiva por fuera del endpoint retorna 403 y revoca el token', async () => {
    const token = await loginAsSuper();
    const created = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());
    const empresaId = created.body.empresa.id as string;
    empresasCreadasIds.push(empresaId);

    const login = await request(app).post('/auth/login').send({
      email: 'admin-test@empresatest.com.py',
      password: created.body.passwordInicial,
    });
    const cookieRaw = login.headers['set-cookie'];
    const cookieArr = Array.isArray(cookieRaw) ? cookieRaw : [String(cookieRaw)];
    const refreshCookie = cookieArr.map((c) => /smash_refresh=([^;]+)/.exec(c)?.[1]).find(Boolean);
    expect(refreshCookie).toBeTruthy();

    // Apagamos activa directamente en la BD (saltando el endpoint que revoca
    // tokens) para validar la defensa en el refresh aunque alguien toque la
    // columna por fuera o haya un refresh creado a posteriori.
    await prisma.empresa.update({
      where: { id: empresaId },
      data: { activa: false, motivoInactiva: 'Test', fechaInactivacion: new Date() },
    });

    const refresh = await request(app)
      .post('/auth/refresh')
      .set('Cookie', `smash_refresh=${refreshCookie}`);
    expect(refresh.status).toBe(403);
    expect(refresh.body.error.code).toBe('EMPRESA_INACTIVA');

    const tokensVivos = await prisma.refreshToken.count({
      where: { usuario: { empresaId }, revocadoEn: null },
    });
    expect(tokensVivos).toBe(0);
  });

  it('SUPER_ADMIN sigue pudiendo loguearse aunque haya empresas inactivas', async () => {
    const token = await loginAsSuper();
    const created = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());
    empresasCreadasIds.push(created.body.empresa.id);
    await request(app)
      .patch(`/admin/empresas/${created.body.empresa.id}/activa`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activa: false, motivo: 'Mora' });

    const reLogin = await request(app).post('/auth/login').send(SUPER);
    expect(reLogin.status).toBe(200);
  });

  it('reactivar empresa permite volver a hacer login', async () => {
    const token = await loginAsSuper();
    const created = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());
    const empresaId = created.body.empresa.id as string;
    empresasCreadasIds.push(empresaId);

    await request(app)
      .patch(`/admin/empresas/${empresaId}/activa`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activa: false, motivo: 'Mora' });
    await request(app)
      .patch(`/admin/empresas/${empresaId}/activa`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activa: true });

    const login = await request(app).post('/auth/login').send({
      email: 'admin-test@empresatest.com.py',
      password: created.body.passwordInicial,
    });
    expect(login.status).toBe(200);
  });
});

describe('Operar como empresa (SUPER_ADMIN)', () => {
  it('emite access token con empresaId seteada y la primera sucursal activa', async () => {
    const token = await loginAsSuper();
    const created = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());
    const empresaId = created.body.empresa.id as string;
    empresasCreadasIds.push(empresaId);

    const operar = await request(app)
      .post(`/admin/empresas/${empresaId}/operar`)
      .set('Authorization', `Bearer ${token}`);
    expect(operar.status).toBe(200);
    expect(operar.body.accessToken).toBeTypeOf('string');
    expect(operar.body.empresa.id).toBe(empresaId);
    // La empresa recién creada no tiene sucursales: la sucursal activa debe ser null.
    expect(operar.body.sucursalActivaId).toBeNull();

    // El token nuevo permite crear sucursales (cosa que el SUPER_ADMIN puro
    // sin empresa no podía hacer porque el endpoint exige empresaId).
    const sucursal = await request(app)
      .post('/sucursales')
      .set('Authorization', `Bearer ${operar.body.accessToken}`)
      .send({
        nombre: 'Sucursal de prueba',
        codigo: 'TST',
        establecimiento: '777',
        direccion: 'Calle test 123',
      });
    expect(sucursal.status).toBe(201);
    expect(sucursal.body.sucursal.empresaId).toBe(empresaId);
  });

  it('rechaza operar como empresa inactiva con 403 EMPRESA_INACTIVA', async () => {
    const token = await loginAsSuper();
    const created = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());
    const empresaId = created.body.empresa.id as string;
    empresasCreadasIds.push(empresaId);

    await request(app)
      .patch(`/admin/empresas/${empresaId}/activa`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activa: false, motivo: 'Mora' });

    const operar = await request(app)
      .post(`/admin/empresas/${empresaId}/operar`)
      .set('Authorization', `Bearer ${token}`);
    expect(operar.status).toBe(403);
    expect(operar.body.error.code).toBe('EMPRESA_INACTIVA');
  });

  it('admin de empresa común NO puede operar como empresa (sólo SUPER_ADMIN)', async () => {
    const token = await loginAsSuper();
    const created = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());
    empresasCreadasIds.push(created.body.empresa.id);

    const adminLogin = await request(app).post('/auth/login').send(ADMIN);
    const res = await request(app)
      .post(`/admin/empresas/${created.body.empresa.id}/operar`)
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('salir-modo-operar emite access token con empresaId null', async () => {
    const token = await loginAsSuper();
    const salir = await request(app)
      .post('/admin/empresas/salir-modo-operar')
      .set('Authorization', `Bearer ${token}`);
    expect(salir.status).toBe(200);
    expect(salir.body.accessToken).toBeTypeOf('string');
  });

  it('refresh con hint empresaIdOperar preserva el modo si la empresa está activa', async () => {
    const token = await loginAsSuper();
    const created = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());
    const empresaId = created.body.empresa.id as string;
    empresasCreadasIds.push(empresaId);

    // El SUPER_ADMIN se logueó al principio del test; usamos su refresh cookie.
    const loginSuper = await request(app).post('/auth/login').send(SUPER);
    const cookieRaw = loginSuper.headers['set-cookie'];
    const cookieArr = Array.isArray(cookieRaw) ? cookieRaw : [String(cookieRaw)];
    const refreshCookie = cookieArr.map((c) => /smash_refresh=([^;]+)/.exec(c)?.[1]).find(Boolean);

    const refresh = await request(app)
      .post('/auth/refresh')
      .set('Cookie', `smash_refresh=${refreshCookie}`)
      .send({ empresaIdOperar: empresaId });
    expect(refresh.status).toBe(200);
    expect(refresh.body.empresaId).toBe(empresaId);
  });

  it('refresh con hint empresaIdOperar inválida cae a empresaId null (no rompe)', async () => {
    const loginSuper = await request(app).post('/auth/login').send(SUPER);
    const cookieRaw = loginSuper.headers['set-cookie'];
    const cookieArr = Array.isArray(cookieRaw) ? cookieRaw : [String(cookieRaw)];
    const refreshCookie = cookieArr.map((c) => /smash_refresh=([^;]+)/.exec(c)?.[1]).find(Boolean);

    const refresh = await request(app)
      .post('/auth/refresh')
      .set('Cookie', `smash_refresh=${refreshCookie}`)
      .send({ empresaIdOperar: 'cl000000000000000000000000' });
    expect(refresh.status).toBe(200);
    expect(refresh.body.empresaId).toBeNull();
  });
});

describe('GET /admin/empresas', () => {
  it('lista empresas con paginación y filtros', async () => {
    const token = await loginAsSuper();
    const created = await request(app)
      .post('/admin/empresas')
      .set('Authorization', `Bearer ${token}`)
      .send(bodyEmpresaBase());
    empresasCreadasIds.push(created.body.empresa.id);

    const res = await request(app)
      .get('/admin/empresas?q=Empresa+Test')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items.some((e: { ruc: string }) => e.ruc === TEST_RUC)).toBe(true);
  });
});

beforeAll(async () => {
  await prisma.$connect();
});

afterEach(async () => {
  // Limpieza después de cada test: borrar las empresas creadas con sus dependencias.
  // El orden de borrado importa porque el cascade del schema solo aplica a algunas relaciones.
  if (empresasCreadasIds.length === 0) return;
  const ids = [...empresasCreadasIds];
  empresasCreadasIds.length = 0;

  await prisma.refreshToken.deleteMany({ where: { usuario: { empresaId: { in: ids } } } });
  await prisma.usuarioPermiso.deleteMany({ where: { usuario: { empresaId: { in: ids } } } });
  await prisma.usuarioSucursal.deleteMany({ where: { usuario: { empresaId: { in: ids } } } });
  await prisma.auditLog.deleteMany({ where: { empresaId: { in: ids } } });
  await prisma.usuario.deleteMany({ where: { empresaId: { in: ids } } });
  await prisma.cliente.deleteMany({ where: { empresaId: { in: ids } } });
  await prisma.menuRol.deleteMany({ where: { empresaId: { in: ids } } });
  await prisma.configuracionEmpresa.deleteMany({ where: { empresaId: { in: ids } } });
  await prisma.empresa.deleteMany({ where: { id: { in: ids } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});
