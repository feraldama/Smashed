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

describe('GET /cajas/cierres/:id — descuentos del turno', () => {
  it('agrega descuentos por motivo y usuario, con totales correctos', async () => {
    await resetCajas();
    // Setup: el descuento necesita un motivo activo + el rol del usuario que
    // aplica con maxPorcentaje suficiente. Limpiamos cualquier sobrante de tests
    // previos y armamos lo mínimo para que ADMIN pueda aplicar sin escalado.
    const empresa = await prisma.empresa.findFirstOrThrow();
    await prisma.codigoAutorizacionDescuento.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.motivoDescuento.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.limiteDescuentoRol.deleteMany({ where: { empresaId: empresa.id } });
    const motivo = await prisma.motivoDescuento.create({
      data: { empresaId: empresa.id, nombre: 'Cliente frecuente' },
    });
    await prisma.limiteDescuentoRol.create({
      data: { empresaId: empresa.id, rol: 'ADMIN_EMPRESA', maxPorcentaje: 100 },
    });

    // Limpiamos pedidos/comprobantes del seed para no contaminar.
    await prisma.pagoComprobante.deleteMany();
    await prisma.itemComprobante.deleteMany();
    await prisma.eventoSifen.deleteMany();
    await prisma.comprobante.deleteMany();
    await prisma.itemPedidoComboOpcion.deleteMany();
    await prisma.itemPedidoModificador.deleteMany();
    await prisma.itemPedido.deleteMany();
    await prisma.pedido.deleteMany();
    await prisma.timbrado.updateMany({ data: { ultimoNumeroUsado: 0 } });

    const tAdmin = await login(ADMIN);

    // Abrir caja (admin puede operar como ADMIN, abre cualquier caja de su empresa).
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${tAdmin}`);
    const cajaCentro = cajas.body.cajas.find(
      (c: { sucursalId: string; nombre: string }) => c.nombre === 'Caja 1',
    );
    expect(cajaCentro).toBeTruthy();
    const apertura = await request(app)
      .post(`/cajas/${cajaCentro.id}/abrir`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ montoInicial: 100000 });
    expect(apertura.status).toBe(201);
    const aperturaId = apertura.body.apertura.id as string;

    // Crear pedido con bebida (sin modificadores obligatorios).
    const beb = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'BEB-001' } });
    const pedido = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [{ productoVentaId: beb.id, cantidad: 1 }],
      });
    expect(pedido.status).toBe(201);
    const totalSinDesc = Number.parseInt(pedido.body.pedido.total, 10);

    // Aplicar descuento 10%.
    const desc = await request(app)
      .post(`/descuentos/pedidos/${pedido.body.pedido.id}/descuento`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ tipo: 'PORCENTAJE', valor: 1000, motivoDescuentoId: motivo.id });
    expect(desc.status).toBe(200);
    const totalConDesc = Number.parseInt(desc.body.pedido.total, 10);
    const montoDesc = Number.parseInt(desc.body.pedido.totalDescuento, 10);

    // Emitir comprobante (pago efectivo, total ya descontado).
    const comp = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({
        pedidoId: pedido.body.pedido.id,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: totalConDesc }],
      });
    expect(comp.status).toBe(201);

    // Cerrar caja: esperado = montoInicial + totalConDesc.
    const cierre = await request(app)
      .post(`/cajas/aperturas/${aperturaId}/cerrar`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ totalContadoEfectivo: 100000 + totalConDesc });
    expect(cierre.status).toBe(200);
    const cierreId = cierre.body.cierre.id as string;

    // GET del cierre — debe traer la sección `descuentos` poblada.
    const detalle = await request(app)
      .get(`/cajas/cierres/${cierreId}`)
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(detalle.status).toBe(200);
    const d = detalle.body.cierre.descuentos;
    expect(d).toBeTruthy();
    expect(d.cantidad).toBe(1);
    expect(d.total).toBe(String(montoDesc));
    expect(d.porMotivo).toHaveLength(1);
    expect(d.porMotivo[0].nombre).toBe('Cliente frecuente');
    expect(d.porMotivo[0].total).toBe(String(montoDesc));
    expect(d.porUsuario).toHaveLength(1);
    expect(d.porUsuario[0].total).toBe(String(montoDesc));

    // Sanity: el total del pedido descontado y montoDesc son coherentes.
    expect(totalSinDesc - montoDesc).toBe(totalConDesc);

    // Cleanup motivo/límite para no afectar tests siguientes.
    await prisma.motivoDescuento.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.limiteDescuentoRol.deleteMany({ where: { empresaId: empresa.id } });
  });

  it('cierre sin descuentos del turno devuelve descuentos vacíos', async () => {
    await resetCajas();
    const tCajero = await login(CAJERO_CENTRO);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${tCajero}`);
    const ap = await request(app)
      .post(`/cajas/${cajas.body.cajas[0].id}/abrir`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ montoInicial: 50000 });
    const cierre = await request(app)
      .post(`/cajas/aperturas/${ap.body.apertura.id}/cerrar`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ totalContadoEfectivo: 50000 });
    expect(cierre.status).toBe(200);

    const detalle = await request(app)
      .get(`/cajas/cierres/${cierre.body.cierre.id}`)
      .set('Authorization', `Bearer ${tCajero}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body.cierre.descuentos.cantidad).toBe(0);
    expect(detalle.body.cierre.descuentos.total).toBe('0');
    expect(detalle.body.cierre.descuentos.porMotivo).toHaveLength(0);
    expect(detalle.body.cierre.descuentos.porUsuario).toHaveLength(0);
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
void COCINA;
