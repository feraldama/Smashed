/**
 * Test de integración de `procesarEmision` contra la BD de test.
 *
 * Verifica el wiring completo: carga del comprobante + credenciales,
 * transición de estados, creación/actualización de EventoSifen, persistencia
 * de cdc/qr y la idempotencia (no re-dar de alta si ya está PENDIENTE).
 *
 * El cliente CODE100 se inyecta mockeado (no hay red ni Redis).
 */
import { EstadoSifen, TasaIva, TipoContribuyente, TipoDocumentoFiscal } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { env } from '../../config/env.js';
import { resetCryptoKeyCache } from '../../lib/crypto.js';
import { prisma } from '../../lib/prisma.js';

import { procesarEmision } from './emision.service.js';
import { guardarConfiguracion } from './facturacion-config.service.js';

import type { Code100Client } from '@smash/code100-client';

const TEST_KEY = 'b'.repeat(64);

// FKs sembrados (resueltos en beforeAll).
let empresaId: string;
let sucursalId: string;
let puntoExpedicionId: string;
let puntoExpedicionCodigo: string;
let establecimiento: string;
let timbradoId: string;
let clienteId: string;
let usuarioId: string;

let keyPrevia: string | undefined;
let numeroSeq = 900_000;

beforeAll(async () => {
  keyPrevia = env.FACTURACION_ENC_KEY;
  env.FACTURACION_ENC_KEY = TEST_KEY;
  resetCryptoKeyCache();

  const empresa = await prisma.empresa.findFirstOrThrow();
  empresaId = empresa.id;
  const sucursal = await prisma.sucursal.findFirstOrThrow({ where: { empresaId } });
  sucursalId = sucursal.id;
  establecimiento = sucursal.establecimiento;
  const pe = await prisma.puntoExpedicion.findFirstOrThrow({ where: { sucursalId } });
  puntoExpedicionId = pe.id;
  puntoExpedicionCodigo = pe.codigo;
  const timbrado = await prisma.timbrado.findFirstOrThrow({ where: { puntoExpedicionId } });
  timbradoId = timbrado.id;
  const cliente = await prisma.cliente.findFirstOrThrow({ where: { empresaId } });
  clienteId = cliente.id;
  const usuario = await prisma.usuario.findFirstOrThrow({ where: { empresaId } });
  usuarioId = usuario.id;

  await guardarConfiguracion(empresaId, {
    ambienteActivo: 'TEST',
    activo: true,
    test: { dominio: 'https://ws.test', ruc: '80012345', password: 'secreto-de-prueba' },
  });
});

afterAll(async () => {
  await prisma.configuracionFacturacion.deleteMany({ where: { empresaId } });
  env.FACTURACION_ENC_KEY = keyPrevia;
  resetCryptoKeyCache();
});

afterEach(async () => {
  await prisma.eventoSifen.deleteMany({ where: { comprobante: { numero: { gte: 900_000 } } } });
  await prisma.itemComprobante.deleteMany({ where: { comprobante: { numero: { gte: 900_000 } } } });
  await prisma.comprobante.deleteMany({ where: { numero: { gte: 900_000 } } });
});

async function crearComprobante(estadoSifen: EstadoSifen = EstadoSifen.NO_ENVIADO) {
  const numero = ++numeroSeq;
  const comp = await prisma.comprobante.create({
    data: {
      empresaId,
      sucursalId,
      puntoExpedicionId,
      timbradoId,
      clienteId,
      emitidoPorId: usuarioId,
      tipoDocumento: TipoDocumentoFiscal.FACTURA,
      establecimiento,
      puntoExpedicionCodigo,
      numero,
      numeroDocumento: `${establecimiento}-${puntoExpedicionCodigo}-${String(numero).padStart(7, '0')}`,
      fechaEmision: new Date('2026-06-15T13:00:00Z'),
      receptorTipoContribuyente: TipoContribuyente.CONSUMIDOR_FINAL,
      receptorRazonSocial: 'Consumidor Final',
      subtotalIva10: 100_000n,
      totalIva10: 10_000n,
      total: 110_000n,
      estadoSifen,
      items: {
        create: {
          descripcion: 'Hamburguesa',
          cantidad: 1,
          precioUnitario: 110_000n,
          tasaIva: TasaIva.IVA_10,
          subtotal: 110_000n,
        },
      },
      pagos: { create: { metodo: 'EFECTIVO', monto: 110_000n } },
    },
  });
  return comp;
}

/** Cliente CODE100 mockeado: sólo se usan altaDocumento y consultarEstado. */
function mockClient(over: Partial<Record<'alta' | 'consulta', unknown>> = {}) {
  const altaDocumento = vi
    .fn()
    .mockResolvedValue(over.alta ?? { status: 'success', message: 'ok' });
  const consultarEstado = vi.fn().mockResolvedValue(
    over.consulta ?? {
      status: 'success',
      response: {
        Estado: 'Aprobado',
        DE: {
          CDC: '0'.repeat(44),
          EnlaceQR: 'https://qr.test',
          Retorno: { Protocolo: '999', Mensaje: 'Aprobado' },
        },
      },
    },
  );
  const client = { altaDocumento, consultarEstado } as unknown as Code100Client;
  return { client, altaDocumento, consultarEstado };
}

describe('procesarEmision (integración BD)', () => {
  it('alta + aprobación → APROBADO con CDC/QR y EventoSifen APROBADO', async () => {
    const comp = await crearComprobante();
    const { client, altaDocumento } = mockClient();

    const r = await procesarEmision(comp.id, () => client);

    expect(r.estadoSifen).toBe(EstadoSifen.APROBADO);
    expect(altaDocumento).toHaveBeenCalledTimes(1);

    const persistido = await prisma.comprobante.findUniqueOrThrow({ where: { id: comp.id } });
    expect(persistido.estadoSifen).toBe(EstadoSifen.APROBADO);
    expect(persistido.cdc).toHaveLength(44);
    expect(persistido.qrUrl).toBe('https://qr.test');
    expect(persistido.fechaAprobacionSifen).not.toBeNull();

    const evento = await prisma.eventoSifen.findFirstOrThrow({
      where: { comprobanteId: comp.id, tipo: 'ENVIO' },
    });
    expect(evento.estado).toBe('APROBADO');
  });

  it('alta rechazada → RECHAZADO con motivo, sin polling', async () => {
    const comp = await crearComprobante();
    const { client, altaDocumento, consultarEstado } = mockClient({
      alta: { status: 'error', message: { iTiDE: ['obligatorio'] } },
    });

    const r = await procesarEmision(comp.id, () => client);

    expect(r.estadoSifen).toBe(EstadoSifen.RECHAZADO);
    expect(altaDocumento).toHaveBeenCalledTimes(1);
    expect(consultarEstado).not.toHaveBeenCalled();

    const persistido = await prisma.comprobante.findUniqueOrThrow({ where: { id: comp.id } });
    expect(persistido.estadoSifen).toBe(EstadoSifen.RECHAZADO);
    expect(persistido.motivoRechazoSifen).toContain('iTiDE');
  });

  it('idempotencia: si ya está PENDIENTE no re-da de alta, sólo reconcilia', async () => {
    const comp = await crearComprobante(EstadoSifen.PENDIENTE);
    // Simula el evento ENVIANDO dejado por un envío previo interrumpido.
    await prisma.eventoSifen.create({
      data: { comprobanteId: comp.id, tipo: 'ENVIO', estado: 'ENVIANDO' },
    });
    const { client, altaDocumento, consultarEstado } = mockClient();

    const r = await procesarEmision(comp.id, () => client);

    expect(altaDocumento).not.toHaveBeenCalled(); // NO re-alta
    expect(consultarEstado).toHaveBeenCalled();
    expect(r.estadoSifen).toBe(EstadoSifen.APROBADO);

    const persistido = await prisma.comprobante.findUniqueOrThrow({ where: { id: comp.id } });
    expect(persistido.cdc).toHaveLength(44);
  });

  it('comprobante ya APROBADO se omite (no llama al proveedor)', async () => {
    const comp = await crearComprobante(EstadoSifen.APROBADO);
    const { client, altaDocumento, consultarEstado } = mockClient();

    const r = await procesarEmision(comp.id, () => client);

    expect(r.estadoSifen).toBe(EstadoSifen.APROBADO);
    expect(altaDocumento).not.toHaveBeenCalled();
    expect(consultarEstado).not.toHaveBeenCalled();
  });
});
