/**
 * Tests del módulo caja.
 * Resetea aperturas/cierres/movimientos al inicio para tener estado limpio.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' };
const CAJERO_CENTRO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };
const CAJERO_SLO = { email: 'cajero2@smash.com.py', password: 'Smash123!' };
const GERENTE_CENTRO = { email: 'gerente.centro@smash.com.py', password: 'Smash123!' };
const COCINA = { email: 'cocina1@smash.com.py', password: 'Smash123!' };

async function login(creds: { email: string; password: string }) {
  const res = await request(app).post('/auth/login').send(creds);
  if (res.status !== 200) {
    throw new Error(`Login fallido para ${creds.email}: ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken as string;
}

async function resetCajas() {
  await prisma.movimientoCaja.deleteMany();
  await prisma.cierreCaja.deleteMany();
  await prisma.aperturaCaja.deleteMany();
  await prisma.caja.updateMany({ data: { estado: 'CERRADA' } });
}

describe('GET /cajas', () => {
  it('sin auth → 401', async () => {
    const res = await request(app).get('/cajas');
    expect(res.status).toBe(401);
  });

  it('cajero de Centro ve solo cajas de Centro', async () => {
    await resetCajas();
    const token = await login(CAJERO_CENTRO);
    const res = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cajas.length).toBe(2); // Caja 1 + Caja Express
    expect(res.body.cajas.every((c: { estado: string }) => c.estado === 'CERRADA')).toBe(true);
  });

  it('cajero de San Lorenzo ve solo caja de San Lorenzo', async () => {
    await resetCajas();
    const token = await login(CAJERO_SLO);
    const res = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cajas.length).toBe(1);
  });
});

describe('POST /cajas/:cajaId/abrir', () => {
  it('cajero abre su caja → 201, estado ABIERTA, MovimientoCaja APERTURA creado', async () => {
    await resetCajas();
    const token = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    const cajaId = cajas.body.cajas[0].id as string;

    const res = await request(app)
      .post(`/cajas/${cajaId}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 200000, notas: 'inicio del turno' });
    expect(res.status).toBe(201);
    expect(res.body.apertura.id).toBeDefined();
    expect(res.body.apertura.montoInicial).toBe('200000');

    // Verificar estado en BD
    const caja = await prisma.caja.findUnique({ where: { id: cajaId } });
    expect(caja?.estado).toBe('ABIERTA');
    const mov = await prisma.movimientoCaja.findFirst({
      where: { aperturaCajaId: res.body.apertura.id, tipo: 'APERTURA' },
    });
    expect(mov?.monto.toString()).toBe('200000');
  });

  it('mismo cajero NO puede abrir una segunda caja simultáneamente → 409', async () => {
    await resetCajas();
    const token = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);

    const primera = await request(app)
      .post(`/cajas/${cajas.body.cajas[0].id}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 100000 });
    expect(primera.status).toBe(201);

    const segunda = await request(app)
      .post(`/cajas/${cajas.body.cajas[1].id}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 100000 });
    expect(segunda.status).toBe(409);
    expect(segunda.body.error.code).toBe('CONFLICT');
  });

  it('cajero de Centro NO puede abrir caja de San Lorenzo → 403', async () => {
    await resetCajas();
    const tokenCajero = await login(CAJERO_CENTRO);
    // Buscamos una caja de San Lorenzo
    const cajaSlo = await prisma.caja.findFirst({
      where: { sucursal: { nombre: 'San Lorenzo' } },
    });
    expect(cajaSlo).toBeDefined();

    const res = await request(app)
      .post(`/cajas/${cajaSlo!.id}/abrir`)
      .set('Authorization', `Bearer ${tokenCajero}`)
      .send({ montoInicial: 100000 });
    expect(res.status).toBe(403);
  });

  it('rol COCINA no puede abrir caja → 403', async () => {
    await resetCajas();
    const token = await login(COCINA);
    const cajas = await prisma.caja.findFirst({
      where: { sucursal: { nombre: 'Asunción Centro' } },
    });
    const res = await request(app)
      .post(`/cajas/${cajas!.id}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 100000 });
    expect(res.status).toBe(403);
  });

  it('caja ya abierta por otro user → 409', async () => {
    await resetCajas();
    // Cajero1 abre Caja 1
    const tCajero = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${tCajero}`);
    const cajaId = cajas.body.cajas[0].id as string;
    await request(app)
      .post(`/cajas/${cajaId}/abrir`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ montoInicial: 100000 });

    // Gerente intenta abrir la MISMA caja → 409
    const tGerente = await login(GERENTE_CENTRO);
    const res = await request(app)
      .post(`/cajas/${cajaId}/abrir`)
      .set('Authorization', `Bearer ${tGerente}`)
      .send({ montoInicial: 100000 });
    expect(res.status).toBe(409);
  });
});

describe('GET /cajas/aperturas/activa', () => {
  it('cajero sin sesión abierta → null', async () => {
    await resetCajas();
    const token = await login(CAJERO_CENTRO);
    const res = await request(app)
      .get('/cajas/aperturas/activa')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.apertura).toBeNull();
  });

  it('después de abrir → retorna la sesión con datos de la caja', async () => {
    await resetCajas();
    const token = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    await request(app)
      .post(`/cajas/${cajas.body.cajas[0].id}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 150000 });

    const res = await request(app)
      .get('/cajas/aperturas/activa')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.apertura).not.toBeNull();
    expect(res.body.apertura.montoInicial).toBe('150000');
    expect(res.body.apertura.caja.nombre).toBeDefined();
  });
});

describe('POST /cajas/aperturas/:id/movimientos', () => {
  it('INGRESO_EXTRA suma al esperado, EGRESO resta', async () => {
    await resetCajas();
    const token = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);

    const apertura = await request(app)
      .post(`/cajas/${cajas.body.cajas[0].id}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 100000 });
    const aperturaId = apertura.body.apertura.id as string;

    await request(app)
      .post(`/cajas/aperturas/${aperturaId}/movimientos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'INGRESO_EXTRA', monto: 50000, concepto: 'Cambio adicional' });

    await request(app)
      .post(`/cajas/aperturas/${aperturaId}/movimientos`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'EGRESO', monto: 20000, concepto: 'Compra papel térmico' });

    const det = await request(app)
      .get(`/cajas/aperturas/${aperturaId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(det.status).toBe(200);
    // 100k + 50k - 20k = 130k
    expect(det.body.apertura.totales.totalEsperadoEfectivo).toBe('130000');
    expect(det.body.apertura.movimientos.length).toBe(3); // APERTURA + INGRESO + EGRESO
  });
});

describe('POST /cajas/aperturas/:id/cerrar', () => {
  it('cierra OK y calcula diferencia (sin diferencia)', async () => {
    await resetCajas();
    const token = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    const cajaId = cajas.body.cajas[0].id as string;

    const apertura = await request(app)
      .post(`/cajas/${cajaId}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 100000 });

    const cierre = await request(app)
      .post(`/cajas/aperturas/${apertura.body.apertura.id}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        totalContadoEfectivo: 100000,
        conteoEfectivo: { '100000': 1 },
        notas: 'cierre sin diferencia',
      });
    expect(cierre.status).toBe(200);
    expect(cierre.body.cierre.totalEsperadoEfectivo).toBe('100000');
    expect(cierre.body.cierre.totalContadoEfectivo).toBe('100000');
    expect(cierre.body.cierre.diferenciaEfectivo).toBe('0');

    const caja = await prisma.caja.findUnique({ where: { id: cajaId } });
    expect(caja?.estado).toBe('CERRADA');
  });

  it('cierra con diferencia negativa (faltó plata)', async () => {
    await resetCajas();
    const token = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    const apertura = await request(app)
      .post(`/cajas/${cajas.body.cajas[0].id}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 200000 });

    const cierre = await request(app)
      .post(`/cajas/aperturas/${apertura.body.apertura.id}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ totalContadoEfectivo: 195000 });
    expect(cierre.status).toBe(200);
    expect(cierre.body.cierre.diferenciaEfectivo).toBe('-5000');
  });

  it('otro cajero NO puede cerrar la caja del primero → 403', async () => {
    await resetCajas();
    const t1 = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${t1}`);
    const apertura = await request(app)
      .post(`/cajas/${cajas.body.cajas[0].id}/abrir`)
      .set('Authorization', `Bearer ${t1}`)
      .send({ montoInicial: 100000 });

    // Segundo cajero (de la misma sucursal? — admin tiene Centro) intenta cerrar
    // Vamos con cajero2 (San Lorenzo) — además de no ser dueño, está en otra sucursal
    const t2 = await login(CAJERO_SLO);
    const res = await request(app)
      .post(`/cajas/aperturas/${apertura.body.apertura.id}/cerrar`)
      .set('Authorization', `Bearer ${t2}`)
      .send({ totalContadoEfectivo: 100000 });
    expect([403, 404]).toContain(res.status); // tenant mismatch o forbidden
  });

  it('GERENTE de la sucursal puede cerrar la caja de un cajero', async () => {
    await resetCajas();
    const tCajero = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${tCajero}`);
    const apertura = await request(app)
      .post(`/cajas/${cajas.body.cajas[0].id}/abrir`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ montoInicial: 100000 });

    const tGerente = await login(GERENTE_CENTRO);
    const res = await request(app)
      .post(`/cajas/aperturas/${apertura.body.apertura.id}/cerrar`)
      .set('Authorization', `Bearer ${tGerente}`)
      .send({ totalContadoEfectivo: 100000, notas: 'cierre por gerente' });
    expect(res.status).toBe(200);
  });

  it('después de cerrar, el cajero puede abrir DE NUEVO la caja', async () => {
    await resetCajas();
    const token = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    const cajaId = cajas.body.cajas[0].id as string;

    const ap1 = await request(app)
      .post(`/cajas/${cajaId}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 100000 });
    await request(app)
      .post(`/cajas/aperturas/${ap1.body.apertura.id}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ totalContadoEfectivo: 100000 });

    // Reabre la misma caja
    const ap2 = await request(app)
      .post(`/cajas/${cajaId}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 50000 });
    expect(ap2.status).toBe(201);
  });

  it('cerrar una apertura que ya fue cerrada → 409', async () => {
    await resetCajas();
    const token = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    const apertura = await request(app)
      .post(`/cajas/${cajas.body.cajas[0].id}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 100000 });
    await request(app)
      .post(`/cajas/aperturas/${apertura.body.apertura.id}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ totalContadoEfectivo: 100000 });

    const segundo = await request(app)
      .post(`/cajas/aperturas/${apertura.body.apertura.id}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ totalContadoEfectivo: 100000 });
    expect(segundo.status).toBe(409);
  });
});

describe('integración listado con sesión activa', () => {
  it('GET /cajas muestra sesionActiva poblada cuando la caja está abierta', async () => {
    await resetCajas();
    const token = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    const cajaId = cajas.body.cajas[0].id as string;
    await request(app)
      .post(`/cajas/${cajaId}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 250000 });

    const refrescado = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    const abierta = refrescado.body.cajas.find((c: { id: string }) => c.id === cajaId);
    expect(abierta.estado).toBe('ABIERTA');
    expect(abierta.sesionActiva).not.toBeNull();
    expect(abierta.sesionActiva.montoInicial).toBe('250000');
    expect(abierta.sesionActiva.usuario.nombreCompleto).toBe('Lucía Acosta');
  });
});

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await resetCajas();
  await prisma.$disconnect();
});

// Helper para silenciar TS sobre admin no usado
void ADMIN;
