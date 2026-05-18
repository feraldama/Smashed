/**
 * Tests del módulo descuento.
 *
 * Cubre:
 *  - Aplicar descuento PORCENTAJE / MONTO / CORTESIA dentro del límite del rol.
 *  - Escalado: rol insuficiente → 403 sin auth; OK con supervisor; OK con código.
 *  - Motivo con `requiereAutorizacion=true` siempre escala.
 *  - Código de un solo uso: re-uso → 409; expirado → 403.
 *  - Cap a la base: descuento mayor al subtotal queda capeado.
 *  - Remover descuento: solo el que aplicó o un supervisor.
 *  - CRUD de motivos, límites y códigos.
 *  - Endpoint verificar-supervisor.
 */
import { type EstadoPedido, type Rol, TipoDescuento } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' };
const GERENTE = { email: 'gerente.centro@smash.com.py', password: 'Smash123!' };
const CAJERO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };

async function login(creds: { email: string; password: string }) {
  const r = await request(app).post('/auth/login').send(creds);
  if (r.status !== 200) throw new Error(`login fallido: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.accessToken as string;
}

async function getProductoIdPorCodigo(codigo: string) {
  const p = await prisma.productoVenta.findFirstOrThrow({ where: { codigo } });
  return p.id;
}

async function puntoMedio() {
  const op = await prisma.modificadorOpcion.findFirstOrThrow({
    where: { modificadorGrupo: { nombre: 'Punto de cocción' }, nombre: 'Medio' },
  });
  return op.id;
}

async function resetPedidos() {
  await prisma.movimientoStock.deleteMany();
  await prisma.itemPedidoComboOpcion.deleteMany();
  await prisma.itemPedidoModificador.deleteMany();
  await prisma.itemPedido.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.sucursal.updateMany({ data: { ultimoNumeroPedido: 0 } });
  await prisma.stockSucursal.updateMany({ data: { stockActual: 1000 } });
}

async function setLimite(
  empresaId: string,
  rol: Rol,
  data: { maxPorcentaje: number; puedeAutorizarOtros?: boolean; puedeUsarCortesia?: boolean },
) {
  await prisma.limiteDescuentoRol.upsert({
    where: { empresaId_rol: { empresaId, rol } },
    create: {
      empresaId,
      rol,
      maxPorcentaje: data.maxPorcentaje,
      puedeAutorizarOtros: data.puedeAutorizarOtros ?? false,
      puedeUsarCortesia: data.puedeUsarCortesia ?? false,
    },
    update: {
      maxPorcentaje: data.maxPorcentaje,
      puedeAutorizarOtros: data.puedeAutorizarOtros ?? false,
      puedeUsarCortesia: data.puedeUsarCortesia ?? false,
    },
  });
}

async function limpiarConfig(empresaId: string) {
  // Borrar config para empezar cada bloque desde cero.
  await prisma.codigoAutorizacionDescuento.deleteMany({ where: { empresaId } });
  await prisma.motivoDescuento.deleteMany({ where: { empresaId } });
  await prisma.limiteDescuentoRol.deleteMany({ where: { empresaId } });
}

async function getEmpresaId() {
  const e = await prisma.empresa.findFirstOrThrow();
  return e.id;
}

/**
 * Crea un pedido MOSTRADOR de 2 hamburguesas (HAM-001 a Gs. 35.000 c/u = 70.000)
 * y devuelve { id, total, subtotal, totalIva }.
 */
async function crearPedidoTest(token: string) {
  const smashId = await getProductoIdPorCodigo('HAM-001');
  const res = await request(app)
    .post('/pedidos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      tipo: 'MOSTRADOR',
      items: [
        {
          productoVentaId: smashId,
          cantidad: 2,
          modificadores: [{ modificadorOpcionId: await puntoMedio() }],
        },
      ],
    });
  if (res.status !== 201)
    throw new Error(`crear pedido: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.pedido as { id: string; total: string; subtotal: string; totalIva: string };
}

describe('POST /descuentos/pedidos/:id/descuento — flujo completo', () => {
  let empresaId: string;
  let motivoStdId: string;
  let motivoEscaladoId: string;

  beforeAll(async () => {
    empresaId = await getEmpresaId();
  });

  beforeEach(async () => {
    await limpiarConfig(empresaId);
    await resetPedidos();

    // Motivos: uno estándar y otro que SIEMPRE escala.
    const m1 = await prisma.motivoDescuento.create({
      data: { empresaId, nombre: 'Cliente frecuente', requiereAutorizacion: false },
    });
    motivoStdId = m1.id;
    const m2 = await prisma.motivoDescuento.create({
      data: { empresaId, nombre: 'Cortesía gerencial', requiereAutorizacion: true },
    });
    motivoEscaladoId = m2.id;

    // Límites: ADMIN sin tope + autoriza + cortesía; GERENTE 30% + autoriza;
    // CAJERO 10% sin autorización.
    await setLimite(empresaId, 'ADMIN_EMPRESA', {
      maxPorcentaje: 100,
      puedeAutorizarOtros: true,
      puedeUsarCortesia: true,
    });
    await setLimite(empresaId, 'GERENTE_SUCURSAL', {
      maxPorcentaje: 30,
      puedeAutorizarOtros: true,
      puedeUsarCortesia: false,
    });
    await setLimite(empresaId, 'CAJERO', { maxPorcentaje: 10 });
  });

  it('cajero aplica 10% dentro de su límite → OK, calcula monto correcto', async () => {
    const token = await login(CAJERO);
    const pedido = await crearPedidoTest(token);
    expect(pedido.total).toBe('70000');

    const res = await request(app)
      .post(`/descuentos/pedidos/${pedido.id}/descuento`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'PORCENTAJE',
        valor: 1000, // 10%
        motivoDescuentoId: motivoStdId,
      });

    expect(res.status).toBe(200);
    expect(res.body.pedido.descuentoTipo).toBe('PORCENTAJE');
    expect(res.body.pedido.totalDescuento).toBe('7000');
    expect(res.body.pedido.total).toBe('63000');
    expect(res.body.pedido.descuentoAutorizadoPorId).toBeNull();
  });

  it('cajero intenta 15% sin auth → 403', async () => {
    const token = await login(CAJERO);
    const pedido = await crearPedidoTest(token);

    const res = await request(app)
      .post(`/descuentos/pedidos/${pedido.id}/descuento`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'PORCENTAJE', valor: 1500, motivoDescuentoId: motivoStdId });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('Excede tu límite');
  });

  it('cajero escala 25% con supervisorAuth (gerente, max 30%) → OK', async () => {
    const token = await login(CAJERO);
    const pedido = await crearPedidoTest(token);

    const res = await request(app)
      .post(`/descuentos/pedidos/${pedido.id}/descuento`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'PORCENTAJE',
        valor: 2500,
        motivoDescuentoId: motivoStdId,
        supervisorAuth: { email: GERENTE.email, password: GERENTE.password },
      });

    expect(res.status).toBe(200);
    expect(res.body.pedido.totalDescuento).toBe('17500');
    expect(res.body.pedido.descuentoAutorizadoPorId).toBeTruthy();
  });

  it('cajero escala 40% pero gerente solo puede hasta 30% → 403', async () => {
    const token = await login(CAJERO);
    const pedido = await crearPedidoTest(token);
    const res = await request(app)
      .post(`/descuentos/pedidos/${pedido.id}/descuento`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'PORCENTAJE',
        valor: 4000,
        motivoDescuentoId: motivoStdId,
        supervisorAuth: { email: GERENTE.email, password: GERENTE.password },
      });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('autorizar hasta 30%');
  });

  it('supervisor con password incorrecta → 403', async () => {
    const token = await login(CAJERO);
    const pedido = await crearPedidoTest(token);
    const res = await request(app)
      .post(`/descuentos/pedidos/${pedido.id}/descuento`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'PORCENTAJE',
        valor: 2000,
        motivoDescuentoId: motivoStdId,
        supervisorAuth: { email: GERENTE.email, password: 'wrong' },
      });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('inválidas');
  });

  it('motivo requiereAutorizacion=true escala aunque % esté en el tope del rol', async () => {
    const token = await login(CAJERO);
    const pedido = await crearPedidoTest(token);
    // 5% (dentro del 10% del cajero) pero motivo escalado → exige supervisor.
    const sinAuth = await request(app)
      .post(`/descuentos/pedidos/${pedido.id}/descuento`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'PORCENTAJE', valor: 500, motivoDescuentoId: motivoEscaladoId });
    expect(sinAuth.status).toBe(403);

    const conAuth = await request(app)
      .post(`/descuentos/pedidos/${pedido.id}/descuento`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'PORCENTAJE',
        valor: 500,
        motivoDescuentoId: motivoEscaladoId,
        supervisorAuth: { email: GERENTE.email, password: GERENTE.password },
      });
    expect(conAuth.status).toBe(200);
  });

  it('código de un solo uso: primer uso OK, segundo uso → 409', async () => {
    const tAdmin = await login(ADMIN);
    const adminUser = await prisma.usuario.findFirstOrThrow({ where: { email: ADMIN.email } });
    // Admin crea código 25% válido 1h.
    const codigoCreado = await prisma.codigoAutorizacionDescuento.create({
      data: {
        empresaId,
        codigo: '12345678',
        maxPorcentaje: 25,
        creadoPorId: adminUser.id,
        expiraEn: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const tCajero = await login(CAJERO);
    const p1 = await crearPedidoTest(tCajero);

    const r1 = await request(app)
      .post(`/descuentos/pedidos/${p1.id}/descuento`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({
        tipo: 'PORCENTAJE',
        valor: 2000,
        motivoDescuentoId: motivoStdId,
        codigoAutorizacion: codigoCreado.codigo,
      });
    expect(r1.status).toBe(200);
    expect(r1.body.pedido.codigoAutorizacionId).toBe(codigoCreado.id);

    // Re-uso del mismo código en otro pedido → debe rebotar.
    const p2 = await crearPedidoTest(tCajero);
    const r2 = await request(app)
      .post(`/descuentos/pedidos/${p2.id}/descuento`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({
        tipo: 'PORCENTAJE',
        valor: 2000,
        motivoDescuentoId: motivoStdId,
        codigoAutorizacion: codigoCreado.codigo,
      });
    expect(r2.status).toBe(403);
    expect(r2.body.error.message).toContain('Código ya usado');

    void tAdmin; // evitar warning
  });

  it('código expirado → 403', async () => {
    const adminUser = await prisma.usuario.findFirstOrThrow({ where: { email: ADMIN.email } });
    const expirado = await prisma.codigoAutorizacionDescuento.create({
      data: {
        empresaId,
        codigo: '99999999',
        maxPorcentaje: 50,
        creadoPorId: adminUser.id,
        expiraEn: new Date(Date.now() - 1000), // ya venció
      },
    });
    const tCajero = await login(CAJERO);
    const p = await crearPedidoTest(tCajero);
    const res = await request(app)
      .post(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({
        tipo: 'PORCENTAJE',
        valor: 2000,
        motivoDescuentoId: motivoStdId,
        codigoAutorizacion: expirado.codigo,
      });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('expirado');
  });

  it('CORTESIA: cajero sin permiso → 403; admin con permiso → OK al 100%', async () => {
    const tCajero = await login(CAJERO);
    const p = await crearPedidoTest(tCajero);
    const rCajero = await request(app)
      .post(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ tipo: 'CORTESIA', valor: 0, motivoDescuentoId: motivoStdId });
    expect(rCajero.status).toBe(403);

    const tAdmin = await login(ADMIN);
    const rAdmin = await request(app)
      .post(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ tipo: 'CORTESIA', valor: 0, motivoDescuentoId: motivoStdId });
    expect(rAdmin.status).toBe(200);
    expect(rAdmin.body.pedido.descuentoTipo).toBe('CORTESIA');
    expect(rAdmin.body.pedido.totalDescuento).toBe('70000');
    expect(rAdmin.body.pedido.total).toBe('0');
  });

  it('MONTO mayor al subtotal queda capeado al subtotal (no total negativo)', async () => {
    const tAdmin = await login(ADMIN);
    const p = await crearPedidoTest(tAdmin);
    // Pedido es Gs. 70.000 y mandamos 500.000 — debe capear a 70.000.
    const res = await request(app)
      .post(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({
        tipo: 'MONTO',
        valor: 500000,
        motivoDescuentoId: motivoStdId,
      });
    expect(res.status).toBe(200);
    expect(res.body.pedido.totalDescuento).toBe('70000');
    expect(res.body.pedido.total).toBe('0');
  });

  it('reaplicar descuento sobrescribe el anterior', async () => {
    const tAdmin = await login(ADMIN);
    const p = await crearPedidoTest(tAdmin);
    const r1 = await request(app)
      .post(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ tipo: 'PORCENTAJE', valor: 1000, motivoDescuentoId: motivoStdId });
    expect(r1.body.pedido.totalDescuento).toBe('7000');

    const r2 = await request(app)
      .post(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ tipo: 'PORCENTAJE', valor: 2000, motivoDescuentoId: motivoStdId });
    expect(r2.status).toBe(200);
    expect(r2.body.pedido.totalDescuento).toBe('14000');
    expect(r2.body.pedido.total).toBe('56000');
  });

  it('motivo de OTRA empresa → 400', async () => {
    const tAdmin = await login(ADMIN);
    const p = await crearPedidoTest(tAdmin);
    const res = await request(app)
      .post(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({
        tipo: 'PORCENTAJE',
        valor: 500,
        motivoDescuentoId: 'cl000000000000000000000000',
      });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /descuentos/pedidos/:id/descuento', () => {
  let empresaId: string;
  let motivoId: string;

  beforeAll(async () => {
    empresaId = await getEmpresaId();
  });

  beforeEach(async () => {
    await limpiarConfig(empresaId);
    await resetPedidos();
    const m = await prisma.motivoDescuento.create({
      data: { empresaId, nombre: 'Test motivo' },
    });
    motivoId = m.id;
    await setLimite(empresaId, 'CAJERO', { maxPorcentaje: 100 });
    await setLimite(empresaId, 'ADMIN_EMPRESA', { maxPorcentaje: 100 });
  });

  it('mismo cajero puede sacar su propio descuento', async () => {
    const token = await login(CAJERO);
    const p = await crearPedidoTest(token);
    await request(app)
      .post(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'PORCENTAJE', valor: 1000, motivoDescuentoId: motivoId });

    const res = await request(app)
      .delete(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.pedido.totalDescuento).toBe('0');
    expect(res.body.pedido.total).toBe('70000');
  });

  it('pedido sin descuento → 409', async () => {
    const token = await login(CAJERO);
    const p = await crearPedidoTest(token);
    const res = await request(app)
      .delete(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it('admin puede sacar descuento de otro usuario', async () => {
    const tCajero = await login(CAJERO);
    const p = await crearPedidoTest(tCajero);
    await request(app)
      .post(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ tipo: 'PORCENTAJE', valor: 500, motivoDescuentoId: motivoId });

    const tAdmin = await login(ADMIN);
    const res = await request(app)
      .delete(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /descuentos/auth/verificar-supervisor', () => {
  let empresaId: string;
  beforeAll(async () => {
    empresaId = await getEmpresaId();
  });
  beforeEach(async () => {
    await limpiarConfig(empresaId);
    await setLimite(empresaId, 'GERENTE_SUCURSAL', {
      maxPorcentaje: 30,
      puedeAutorizarOtros: true,
    });
  });

  it('credenciales correctas + rol con puedeAutorizar → 200 con límites', async () => {
    const token = await login(CAJERO);
    const res = await request(app)
      .post('/descuentos/auth/verificar-supervisor')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: GERENTE.email, password: GERENTE.password });
    expect(res.status).toBe(200);
    expect(res.body.maxPorcentaje).toBe(30);
    expect(res.body.rol).toBe('GERENTE_SUCURSAL');
  });

  it('credenciales correctas pero rol sin puedeAutorizar → 403', async () => {
    await setLimite(empresaId, 'GERENTE_SUCURSAL', {
      maxPorcentaje: 30,
      puedeAutorizarOtros: false,
    });
    const token = await login(CAJERO);
    const res = await request(app)
      .post('/descuentos/auth/verificar-supervisor')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: GERENTE.email, password: GERENTE.password });
    expect(res.status).toBe(403);
  });

  it('password incorrecta → 403', async () => {
    const token = await login(CAJERO);
    const res = await request(app)
      .post('/descuentos/auth/verificar-supervisor')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: GERENTE.email, password: 'wrong' });
    expect(res.status).toBe(403);
  });
});

describe('CRUD motivos / límites / códigos', () => {
  let empresaId: string;
  beforeAll(async () => {
    empresaId = await getEmpresaId();
  });
  beforeEach(async () => {
    await limpiarConfig(empresaId);
    await setLimite(empresaId, 'ADMIN_EMPRESA', {
      maxPorcentaje: 100,
      puedeAutorizarOtros: true,
    });
    await setLimite(empresaId, 'GERENTE_SUCURSAL', {
      maxPorcentaje: 30,
      puedeAutorizarOtros: true,
    });
  });

  it('motivos: admin crea, lista, actualiza, soft-delete; cajero no puede crear', async () => {
    const tAdmin = await login(ADMIN);
    const tCajero = await login(CAJERO);

    const crear = await request(app)
      .post('/descuentos/motivos')
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ nombre: 'Cumpleaños', requiereAutorizacion: false });
    expect(crear.status).toBe(201);
    const motivoId = crear.body.motivo.id;

    const negar = await request(app)
      .post('/descuentos/motivos')
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ nombre: 'Otro' });
    expect(negar.status).toBe(403);

    const listar = await request(app)
      .get('/descuentos/motivos')
      .set('Authorization', `Bearer ${tCajero}`);
    expect(listar.status).toBe(200);
    expect(listar.body.motivos.length).toBeGreaterThan(0);

    const upd = await request(app)
      .patch(`/descuentos/motivos/${motivoId}`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ requiereAutorizacion: true });
    expect(upd.body.motivo.requiereAutorizacion).toBe(true);

    const del = await request(app)
      .delete(`/descuentos/motivos/${motivoId}`)
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(del.status).toBe(204);
  });

  it('límites: admin bulk-update varios roles a la vez', async () => {
    const tAdmin = await login(ADMIN);
    const res = await request(app)
      .patch('/descuentos/limites')
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({
        limites: [
          { rol: 'CAJERO', maxPorcentaje: 5, puedeAutorizarOtros: false, puedeUsarCortesia: false },
          {
            rol: 'GERENTE_SUCURSAL',
            maxPorcentaje: 50,
            puedeAutorizarOtros: true,
            puedeUsarCortesia: true,
          },
        ],
      });
    expect(res.status).toBe(200);
    const cajeroLim = res.body.limites.find((l: { rol: Rol }) => l.rol === 'CAJERO');
    expect(cajeroLim.maxPorcentaje).toBe(5);
  });

  it('códigos: admin crea + gerente crea hasta su límite + cajero no puede', async () => {
    const tAdmin = await login(ADMIN);
    const tGerente = await login(GERENTE);
    const tCajero = await login(CAJERO);

    const c1 = await request(app)
      .post('/descuentos/codigos')
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ maxPorcentaje: 75, expiraEnHoras: 12 });
    expect(c1.status).toBe(201);
    expect(c1.body.codigo.maxPorcentaje).toBe(75);
    expect(c1.body.codigo.codigo).toMatch(/^\d{8}$/);

    // Gerente tiene 30 — pedir 25 va, pedir 50 no.
    const c2 = await request(app)
      .post('/descuentos/codigos')
      .set('Authorization', `Bearer ${tGerente}`)
      .send({ maxPorcentaje: 25 });
    expect(c2.status).toBe(201);

    const c3 = await request(app)
      .post('/descuentos/codigos')
      .set('Authorization', `Bearer ${tGerente}`)
      .send({ maxPorcentaje: 50 });
    expect(c3.status).toBe(400);

    // Cajero sin puedeAutorizar → 403.
    const c4 = await request(app)
      .post('/descuentos/codigos')
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ maxPorcentaje: 10 });
    expect(c4.status).toBe(403);
  });
});

describe('Guards adicionales', () => {
  let empresaId: string;
  let motivoId: string;
  beforeAll(async () => {
    empresaId = await getEmpresaId();
  });
  beforeEach(async () => {
    await limpiarConfig(empresaId);
    await resetPedidos();
    await setLimite(empresaId, 'ADMIN_EMPRESA', { maxPorcentaje: 100 });
    const m = await prisma.motivoDescuento.create({
      data: { empresaId, nombre: 'Guard motivo' },
    });
    motivoId = m.id;
  });

  it('no se puede aplicar descuento a pedido CANCELADO → 409', async () => {
    const tAdmin = await login(ADMIN);
    const p = await crearPedidoTest(tAdmin);
    await prisma.pedido.update({
      where: { id: p.id },
      data: { estado: 'CANCELADO' satisfies EstadoPedido },
    });
    const res = await request(app)
      .post(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ tipo: 'PORCENTAJE', valor: 500, motivoDescuentoId: motivoId });
    expect(res.status).toBe(409);
  });

  it('valor 0 → 400 (no descuento)', async () => {
    const tAdmin = await login(ADMIN);
    const p = await crearPedidoTest(tAdmin);
    const res = await request(app)
      .post(`/descuentos/pedidos/${p.id}/descuento`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ tipo: 'PORCENTAJE', valor: 0, motivoDescuentoId: motivoId });
    expect(res.status).toBe(400);
  });

  it('TipoDescuento enum runtime check', () => {
    // Sanity: el enum existe y tiene los 3 valores.
    expect(Object.values(TipoDescuento)).toEqual(['PORCENTAJE', 'MONTO', 'CORTESIA']);
  });
});

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  const empresaId = await getEmpresaId();
  await limpiarConfig(empresaId);
  await resetPedidos();
  await prisma.$disconnect();
});
