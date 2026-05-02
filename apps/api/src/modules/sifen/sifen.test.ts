/**
 * Tests del módulo SIFEN.
 *
 * Inyecta MockSifenClient + cert de test (generado con
 * `pnpm --filter @smash/sifen-client generar-cert-test`) usando los hooks
 * `setSifenClientForTests` y `setCertForTests`.
 *
 * Asume seed: timbrado activo de FACTURA en Caja 1 de Centro (PuntoExpedicion 001).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cargarP12, MockSifenClient } from '@smash/sifen-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { setCertForTests, setSifenClientForTests } from '../../lib/sifen.js';

const app = createApp();

const CAJERO_CENTRO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };

const here = dirname(fileURLToPath(import.meta.url));
// apps/api/src/modules/sifen → packages/sifen-client/test-cert
const P12_PATH = resolve(here, '../../../../../packages/sifen-client/test-cert/test.p12');

let mockClient: MockSifenClient;

beforeAll(() => {
  if (!existsSync(P12_PATH)) {
    throw new Error(
      `Test cert no encontrado en ${P12_PATH}. ` +
        'Generar con: pnpm --filter @smash/sifen-client generar-cert-test',
    );
  }
  const cert = cargarP12(readFileSync(P12_PATH), 'smash-test');
  setCertForTests(cert);
  mockClient = new MockSifenClient({ ambiente: 'TEST' });
  setSifenClientForTests(mockClient);
});

afterAll(() => {
  setCertForTests(null);
  setSifenClientForTests(null);
});

async function login(creds: { email: string; password: string }) {
  const res = await request(app).post('/auth/login').send(creds);
  if (res.status !== 200) throw new Error(`login fallido: ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

async function reset() {
  await prisma.movimientoCaja.deleteMany();
  await prisma.cierreCaja.deleteMany();
  await prisma.aperturaCaja.deleteMany();
  await prisma.caja.updateMany({ data: { estado: 'CERRADA' } });
  await prisma.movimientoStock.deleteMany();
  await prisma.pagoComprobante.deleteMany();
  await prisma.itemComprobante.deleteMany();
  await prisma.eventoSifen.deleteMany();
  await prisma.comprobante.deleteMany();
  await prisma.itemPedidoComboOpcion.deleteMany();
  await prisma.itemPedidoModificador.deleteMany();
  await prisma.itemPedido.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.timbrado.updateMany({ data: { ultimoNumeroUsado: 0 } });
  await prisma.sucursal.updateMany({ data: { ultimoNumeroPedido: 0 } });
  await prisma.stockSucursal.updateMany({ data: { stockActual: 1000 } });
  mockClient.reset();
}

async function emitirFacturaParaCliente(token: string) {
  // Abrir caja
  const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
  const caja1 = cajas.body.cajas.find((c: { nombre: string }) => c.nombre === 'Caja 1');
  await request(app)
    .post(`/cajas/${caja1.id}/abrir`)
    .set('Authorization', `Bearer ${token}`)
    .send({ montoInicial: 100000 });

  // Crear pedido
  const ham = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'HAM-001' } });
  const crear = await request(app)
    .post('/pedidos')
    .set('Authorization', `Bearer ${token}`)
    .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: ham.id, cantidad: 1 }] });

  await request(app)
    .post(`/pedidos/${crear.body.pedido.id}/confirmar`)
    .set('Authorization', `Bearer ${token}`);

  // Cliente con RUC (para que sea SIFEN-elegible)
  const cliente = await prisma.cliente.findFirstOrThrow({
    where: { razonSocial: 'CONSULTORA DEL ESTE S.A.' },
  });

  // Emitir FACTURA (TICKET no se envía a SIFEN)
  const c = await request(app)
    .post('/comprobantes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      pedidoId: crear.body.pedido.id,
      clienteId: cliente.id,
      tipoDocumento: 'FACTURA',
      pagos: [{ metodo: 'TRANSFERENCIA', monto: Number(crear.body.pedido.total) }],
    });
  if (c.status !== 201) throw new Error(`emitir falló: ${JSON.stringify(c.body)}`);
  return c.body.comprobante.id as string;
}

describe('POST /comprobantes/:id/sifen/enviar', () => {
  it('aprueba un comprobante FACTURA (mock APROBADO) y persiste cdc/xml/qr', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const compId = await emitirFacturaParaCliente(token);

    const res = await request(app)
      .post(`/comprobantes/${compId}/sifen/enviar`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(202);
    expect(res.body.estadoSifen).toBe('APROBADO');
    expect(res.body.cdc).toMatch(/^\d{44}$/);
    expect(res.body.protocolo).toMatch(/^MOCK-/);
    expect(res.body.qrUrl).toMatch(/ekuatia/);

    // BD actualizada
    const c = await prisma.comprobante.findUniqueOrThrow({ where: { id: compId } });
    expect(c.estadoSifen).toBe('APROBADO');
    expect(c.cdc).toBe(res.body.cdc);
    expect(c.xmlFirmado).toContain('<ds:Signature');
    expect(c.qrUrl).toMatch(/ekuatia/);
    expect(c.fechaEnvioSifen).not.toBeNull();
    expect(c.fechaAprobacionSifen).not.toBeNull();

    // Evento de auditoría creado
    const ev = await prisma.eventoSifen.findFirstOrThrow({
      where: { comprobanteId: compId, tipo: 'ENVIO' },
    });
    expect(ev.estado).toBe('APROBADO');
    expect(ev.xmlEnviado).toContain('<ds:Signature');
  });

  it('rechazo SIFEN — registra motivo y queda RECHAZADO', async () => {
    await reset();
    setSifenClientForTests(new MockSifenClient({ ambiente: 'TEST', forzarRechazo: true }));

    const token = await login(CAJERO_CENTRO);
    const compId = await emitirFacturaParaCliente(token);

    const res = await request(app)
      .post(`/comprobantes/${compId}/sifen/enviar`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(202);
    expect(res.body.estadoSifen).toBe('RECHAZADO');

    const c = await prisma.comprobante.findUniqueOrThrow({ where: { id: compId } });
    expect(c.estadoSifen).toBe('RECHAZADO');
    expect(c.motivoRechazoSifen).toMatch(/0500/);
    expect(c.fechaAprobacionSifen).toBeNull();

    // Restaurar el mock por default para el resto de los tests
    setSifenClientForTests(mockClient);
  });

  it('TICKET no se envía a SIFEN → 409', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);

    // Abrir caja + emitir TICKET
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    const caja1 = cajas.body.cajas.find((c: { nombre: string }) => c.nombre === 'Caja 1');
    await request(app)
      .post(`/cajas/${caja1.id}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 100000 });
    const ham = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'HAM-001' } });
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: ham.id, cantidad: 1 }] });
    await request(app)
      .post(`/pedidos/${crear.body.pedido.id}/confirmar`)
      .set('Authorization', `Bearer ${token}`);
    const c = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId: crear.body.pedido.id,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(crear.body.pedido.total) }],
      });

    const res = await request(app)
      .post(`/comprobantes/${c.body.comprobante.id}/sifen/enviar`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/no son? soportados|no se envían|TICKET/i);
  });

  it('reenvío de comprobante ya APROBADO → 409', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const compId = await emitirFacturaParaCliente(token);

    await request(app)
      .post(`/comprobantes/${compId}/sifen/enviar`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/comprobantes/${compId}/sifen/enviar`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/ya aprobado/i);
  });

  it('persiste EventoSifen ENVIANDO antes del HTTP — flujo del happy path lo cierra', async () => {
    // Smoke test del idempotency record: el evento del envío exitoso debe haber
    // pasado por ENVIANDO → APROBADO (o RECHAZADO). Como no podemos pausar la
    // llamada al mock para observar el estado intermedio, validamos que el
    // único evento de ENVIO asociado tenga estado terminal (no ENVIANDO huérfano).
    await reset();
    const token = await login(CAJERO_CENTRO);
    const compId = await emitirFacturaParaCliente(token);

    await request(app)
      .post(`/comprobantes/${compId}/sifen/enviar`)
      .set('Authorization', `Bearer ${token}`);

    const eventos = await prisma.eventoSifen.findMany({
      where: { comprobanteId: compId, tipo: 'ENVIO' },
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.estado).toBe('APROBADO');
    expect(eventos[0]!.respondidoEn).not.toBeNull();
    expect(eventos[0]!.xmlEnviado).toContain('<ds:Signature');
    expect(eventos[0]!.xmlRespuesta).toContain('rResEnviDe');
  });

  it('reconcilia un envío huérfano (proceso muerto entre PENDIENTE y respuesta)', async () => {
    // Simulamos el escenario "proceso muerto a mitad de envío":
    //  1. Emitir comprobante.
    //  2. Insertar manualmente un EventoSifen ENVIANDO + cdc + estadoSifen=PENDIENTE
    //     (replicando lo que persistirían las primeras líneas de enviarComprobante).
    //  3. Llamar /enviar de nuevo: debe detectar el huérfano, llamar consultarDe
    //     (mock que devuelve PENDIENTE para CDCs no enviados) y dejar el comprobante en PENDIENTE.
    //  4. "Enviar" el CDC al mock simulando el envío original que sí llegó a DNIT.
    //  5. Reintentar /enviar: ahora consultarDe devuelve APROBADO y debe reconciliar.
    await reset();
    const token = await login(CAJERO_CENTRO);
    const compId = await emitirFacturaParaCliente(token);

    // 2. Setup del huérfano
    const cdcFalso = '01800123450010010000000012026050100000001234'; // 44 dígitos
    await prisma.comprobante.update({
      where: { id: compId },
      data: {
        cdc: cdcFalso,
        xmlFirmado: '<rDE><DE Id="x"/><ds:Signature/></rDE>',
        estadoSifen: 'PENDIENTE',
        fechaEnvioSifen: new Date(),
      },
    });
    await prisma.eventoSifen.create({
      data: {
        comprobanteId: compId,
        tipo: 'ENVIO',
        estado: 'ENVIANDO',
        xmlEnviado: '<rDE/>',
      },
    });

    // 3. /enviar detecta huérfano → consultarDe devuelve PENDIENTE → no resuelve aún
    const r1 = await request(app)
      .post(`/comprobantes/${compId}/sifen/enviar`)
      .set('Authorization', `Bearer ${token}`);
    expect(r1.status).toBe(202);
    expect(r1.body.estadoSifen).toBe('PENDIENTE');
    const cAfter1 = await prisma.comprobante.findUniqueOrThrow({ where: { id: compId } });
    expect(cAfter1.estadoSifen).toBe('PENDIENTE');

    // 4. Simular que el envío original sí llegó al mock (lo metemos directamente).
    await mockClient.enviarDe({ xmlFirmado: '<rDE/>', cdc: cdcFalso });

    // 5. Reintentar /enviar — ahora el mock recuerda el CDC y devuelve APROBADO en consultarDe.
    const r2 = await request(app)
      .post(`/comprobantes/${compId}/sifen/enviar`)
      .set('Authorization', `Bearer ${token}`);
    expect(r2.status).toBe(202);
    expect(r2.body.estadoSifen).toBe('APROBADO');

    const cAfter2 = await prisma.comprobante.findUniqueOrThrow({ where: { id: compId } });
    expect(cAfter2.estadoSifen).toBe('APROBADO');

    // El evento huérfano fue cerrado (no quedó ENVIANDO)
    const eventos = await prisma.eventoSifen.findMany({
      where: { comprobanteId: compId, tipo: 'ENVIO' },
      orderBy: { enviadoEn: 'asc' },
    });
    expect(eventos.every((e) => e.estado !== 'ENVIANDO')).toBe(true);
    expect(eventos.some((e) => e.motivo?.includes('reconciliado'))).toBe(true);
  });
});

describe('GET /comprobantes/:id/sifen/estado', () => {
  it('consulta estado SIFEN y devuelve respuesta del mock', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const compId = await emitirFacturaParaCliente(token);

    await request(app)
      .post(`/comprobantes/${compId}/sifen/enviar`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/comprobantes/${compId}/sifen/estado`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.estadoLocal).toBe('APROBADO');
    expect(res.body.estadoSifen).toBe('APROBADO');
    expect(res.body.cdc).toMatch(/^\d{44}$/);
  });

  it('comprobante sin enviar (sin CDC) → 409', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const compId = await emitirFacturaParaCliente(token);

    const res = await request(app)
      .get(`/comprobantes/${compId}/sifen/estado`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/sin CDC|no tiene CDC/);
  });
});

describe('POST /comprobantes/:id/sifen/cancelar', () => {
  it('cancela un comprobante APROBADO y lo deja CANCELADO + ANULADO', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const compId = await emitirFacturaParaCliente(token);

    await request(app)
      .post(`/comprobantes/${compId}/sifen/enviar`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/comprobantes/${compId}/sifen/cancelar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Error en datos del receptor — solicitud del cliente' });
    expect(res.status).toBe(200);
    expect(res.body.aprobado).toBe(true);
    expect(res.body.estadoSifen).toBe('CANCELADO');

    const c = await prisma.comprobante.findUniqueOrThrow({ where: { id: compId } });
    expect(c.estadoSifen).toBe('CANCELADO');
    expect(c.estado).toBe('ANULADO');
    expect(c.anuladoEn).not.toBeNull();
    expect(c.motivoAnulacion).toMatch(/Error en datos/);

    const ev = await prisma.eventoSifen.findFirstOrThrow({
      where: { comprobanteId: compId, tipo: 'CANCELACION' },
    });
    expect(ev.estado).toBe('APROBADO');
    expect(ev.xmlEnviado).toMatch(/<rEv/);
  });

  it('cancelación sin envío previo → 409 (no hay CDC)', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const compId = await emitirFacturaParaCliente(token);

    const res = await request(app)
      .post(`/comprobantes/${compId}/sifen/cancelar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'pruebas — cancelación sin envío previo' });
    expect(res.status).toBe(409);
  });

  it('motivo muy corto (< 5 chars) → 400', async () => {
    await reset();
    const token = await login(CAJERO_CENTRO);
    const compId = await emitirFacturaParaCliente(token);

    await request(app)
      .post(`/comprobantes/${compId}/sifen/enviar`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/comprobantes/${compId}/sifen/cancelar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'pq' });
    expect(res.status).toBe(400);
  });
});
