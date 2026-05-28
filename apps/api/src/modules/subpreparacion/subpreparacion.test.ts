/**
 * Tests del módulo subpreparacion — modo LOTE + producción + listado.
 *
 * Cubre:
 *  - Cambiar receta de CALCULADA a LOTE crea PI espejo automáticamente
 *  - Cambiar a CALCULADA limpia vínculo pero preserva el PI espejo
 *  - Producir lote descuenta insumos crudos y suma al espejo
 *  - Producir sin estar en modo LOTE → 409
 *  - Listar subpreparaciones incluye stock del espejo por sucursal
 *  - expandirReceta corta en LOTE y consume del espejo
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { expandirReceta } from '../pedido/stock-recursivo.js';

const app = createApp();

const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' };
const CAJERO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };

async function login(creds: { email: string; password: string }) {
  const res = await request(app).post('/auth/login').send(creds);
  if (res.status !== 200) throw new Error(`login fallido: ${res.status}`);
  return res.body.accessToken as string;
}

// Helper: crea una subprep TEST con receta = N unidades de un insumo dado.
async function crearSubprepConReceta(opts: {
  nombre: string;
  insumoId: string;
  cantidad: number;
  empresaId: string;
  unidadMedida: 'UNIDAD' | 'GRAMO' | 'MILILITRO';
}) {
  return prisma.productoVenta.create({
    data: {
      empresaId: opts.empresaId,
      nombre: opts.nombre,
      precioBase: 0n,
      esVendible: false,
      esPreparacion: true,
      receta: {
        create: {
          empresaId: opts.empresaId,
          rinde: 1,
          items: {
            create: {
              productoInventarioId: opts.insumoId,
              cantidad: opts.cantidad,
              unidadMedida: opts.unidadMedida,
            },
          },
        },
      },
    },
    include: { receta: true },
  });
}

async function cleanup() {
  // Borrar solo los PI espejo CREADOS AUTOMÁTICAMENTE por los tests (los que
  // tienen descripcion "Espejo de sub-preparación \"TEST_SUBPREP_..."). Nunca
  // tocar PIs del seed, aunque alguno haya sido usado como espejo vinculado.
  const espejosAuto = await prisma.productoInventario.findMany({
    where: { descripcion: { startsWith: 'Espejo de sub-preparación "TEST_SUBPREP_' } },
    select: { id: true },
  });
  const espejosIds = espejosAuto.map((p) => p.id);

  await prisma.movimientoStock.deleteMany({
    where: { productoInventarioId: { in: espejosIds } },
  });
  await prisma.stockSucursal.deleteMany({
    where: { productoInventarioId: { in: espejosIds } },
  });
  await prisma.itemReceta.deleteMany({
    where: { receta: { productoVenta: { nombre: { startsWith: 'TEST_SUBPREP_' } } } },
  });
  await prisma.receta.deleteMany({
    where: { productoVenta: { nombre: { startsWith: 'TEST_SUBPREP_' } } },
  });
  await prisma.productoVenta.deleteMany({
    where: { nombre: { startsWith: 'TEST_SUBPREP_' } },
  });
  await prisma.productoInventario.deleteMany({
    where: { id: { in: espejosIds } },
  });
}

beforeAll(cleanup);
afterAll(cleanup);

describe('PATCH /subpreparaciones/:id/modo-stock', () => {
  it('cajero no tiene permiso → 403', async () => {
    await cleanup();
    const token = await login(CAJERO);
    const empresaId = (await prisma.usuario.findFirstOrThrow({ where: { email: CAJERO.email } }))
      .empresaId as string;
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'CAR-001' },
    });
    const sub = await crearSubprepConReceta({
      nombre: 'TEST_SUBPREP_FORBIDDEN',
      insumoId: insumo.id,
      cantidad: 1,
      empresaId,
      unidadMedida: 'UNIDAD',
    });

    const res = await request(app)
      .patch(`/subpreparaciones/${sub.id}/modo-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ modoStock: 'LOTE' });
    expect(res.status).toBe(403);
  });

  it('CALCULADA → LOTE crea PI espejo automáticamente', async () => {
    await cleanup();
    const token = await login(ADMIN);
    const empresaId = (await prisma.usuario.findFirstOrThrow({ where: { email: ADMIN.email } }))
      .empresaId as string;
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'CAR-001' },
    });
    const sub = await crearSubprepConReceta({
      nombre: 'TEST_SUBPREP_AUTOMIRROR',
      insumoId: insumo.id,
      cantidad: 1,
      empresaId,
      unidadMedida: 'UNIDAD',
    });

    const res = await request(app)
      .patch(`/subpreparaciones/${sub.id}/modo-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ modoStock: 'LOTE' });
    expect(res.status).toBe(200);
    expect(res.body.receta.modoStock).toBe('LOTE');
    expect(res.body.receta.productoInventarioId).toBeTruthy();
    expect(res.body.receta.productoInventarioEspejo.nombre).toBe('TEST_SUBPREP_AUTOMIRROR');
  });

  it('CALCULADA → LOTE puede vincular a un PI existente', async () => {
    await cleanup();
    const token = await login(ADMIN);
    const empresaId = (await prisma.usuario.findFirstOrThrow({ where: { email: ADMIN.email } }))
      .empresaId as string;
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'CAR-001' },
    });
    const sub = await crearSubprepConReceta({
      nombre: 'TEST_SUBPREP_EXISTING',
      insumoId: insumo.id,
      cantidad: 1,
      empresaId,
      unidadMedida: 'UNIDAD',
    });

    // PI a reutilizar (cualquiera de la empresa)
    const piExistente = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'LAC-002' },
    });

    const res = await request(app)
      .patch(`/subpreparaciones/${sub.id}/modo-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ modoStock: 'LOTE', productoInventarioId: piExistente.id });
    expect(res.status).toBe(200);
    expect(res.body.receta.productoInventarioId).toBe(piExistente.id);
  });

  it('LOTE → CALCULADA limpia el vínculo pero preserva el PI espejo', async () => {
    await cleanup();
    const token = await login(ADMIN);
    const empresaId = (await prisma.usuario.findFirstOrThrow({ where: { email: ADMIN.email } }))
      .empresaId as string;
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'CAR-001' },
    });
    const sub = await crearSubprepConReceta({
      nombre: 'TEST_SUBPREP_BACKTOCALC',
      insumoId: insumo.id,
      cantidad: 1,
      empresaId,
      unidadMedida: 'UNIDAD',
    });

    // Activar LOTE
    const lote = await request(app)
      .patch(`/subpreparaciones/${sub.id}/modo-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ modoStock: 'LOTE' });
    const espejoId = lote.body.receta.productoInventarioId as string;

    // Volver a CALCULADA
    const res = await request(app)
      .patch(`/subpreparaciones/${sub.id}/modo-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ modoStock: 'CALCULADA' });
    expect(res.status).toBe(200);
    expect(res.body.receta.modoStock).toBe('CALCULADA');
    expect(res.body.receta.productoInventarioId).toBeNull();

    // El PI espejo sigue en la BD
    const piTodavia = await prisma.productoInventario.findUnique({ where: { id: espejoId } });
    expect(piTodavia).not.toBeNull();
  });
});

describe('POST /subpreparaciones/:id/producir', () => {
  it('produce un lote: descuenta insumos y suma al espejo', async () => {
    await cleanup();
    const token = await login(ADMIN);
    const empresaId = (await prisma.usuario.findFirstOrThrow({ where: { email: ADMIN.email } }))
      .empresaId as string;
    const sucursal = await prisma.sucursal.findFirstOrThrow({
      where: { nombre: 'Asunción Centro' },
    });
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'CAR-001' },
    });

    // Subprep TEST con receta: 1 unidad de medallón por porción producida.
    const sub = await crearSubprepConReceta({
      nombre: 'TEST_SUBPREP_PRODUCIR',
      insumoId: insumo.id,
      cantidad: 1,
      empresaId,
      unidadMedida: 'UNIDAD',
    });

    // Activar LOTE (crea espejo)
    const lote = await request(app)
      .patch(`/subpreparaciones/${sub.id}/modo-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ modoStock: 'LOTE' });
    const espejoId = lote.body.receta.productoInventarioId as string;

    // Resetear stock del medallón a un valor conocido
    await prisma.stockSucursal.updateMany({
      where: { productoInventarioId: insumo.id, sucursalId: sucursal.id },
      data: { stockActual: 100 },
    });

    const res = await request(app)
      .post(`/subpreparaciones/${sub.id}/producir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: sucursal.id, cantidad: 10, notas: 'lote prueba' });
    expect(res.status).toBe(201);
    expect(res.body.produccion.cantidadProducida).toBe(10);
    expect(res.body.produccion.insumosConsumidos).toBe(1);

    // Insumo: 100 - 10 = 90
    const stockInsumo = await prisma.stockSucursal.findFirstOrThrow({
      where: { productoInventarioId: insumo.id, sucursalId: sucursal.id },
    });
    expect(Number(stockInsumo.stockActual)).toBe(90);

    // Espejo: +10
    const stockEspejo = await prisma.stockSucursal.findFirstOrThrow({
      where: { productoInventarioId: espejoId, sucursalId: sucursal.id },
    });
    expect(Number(stockEspejo.stockActual)).toBe(10);

    // Movimientos: SALIDA_CONSUMO_INTERNO + ENTRADA_PRODUCCION
    const movs = await prisma.movimientoStock.findMany({
      where: {
        OR: [
          { productoInventarioId: insumo.id, motivo: { contains: 'TEST_SUBPREP_PRODUCIR' } },
          { productoInventarioId: espejoId },
        ],
      },
    });
    const tipos = movs.map((m) => m.tipo);
    expect(tipos).toContain('SALIDA_CONSUMO_INTERNO');
    expect(tipos).toContain('ENTRADA_PRODUCCION');
  });

  it('producir sin estar en modo LOTE → 409', async () => {
    await cleanup();
    const token = await login(ADMIN);
    const empresaId = (await prisma.usuario.findFirstOrThrow({ where: { email: ADMIN.email } }))
      .empresaId as string;
    const sucursal = await prisma.sucursal.findFirstOrThrow({
      where: { nombre: 'Asunción Centro' },
    });
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'CAR-001' },
    });
    const sub = await crearSubprepConReceta({
      nombre: 'TEST_SUBPREP_NOLOTE',
      insumoId: insumo.id,
      cantidad: 1,
      empresaId,
      unidadMedida: 'UNIDAD',
    });

    const res = await request(app)
      .post(`/subpreparaciones/${sub.id}/producir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: sucursal.id, cantidad: 5 });
    expect(res.status).toBe(409);
  });
});

describe('GET /subpreparaciones', () => {
  it('lista incluye modo, espejo y stock por sucursal', async () => {
    await cleanup();
    const token = await login(ADMIN);
    const empresaId = (await prisma.usuario.findFirstOrThrow({ where: { email: ADMIN.email } }))
      .empresaId as string;
    const sucursal = await prisma.sucursal.findFirstOrThrow({
      where: { nombre: 'Asunción Centro' },
    });
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'CAR-001' },
    });
    const sub = await crearSubprepConReceta({
      nombre: 'TEST_SUBPREP_LIST',
      insumoId: insumo.id,
      cantidad: 1,
      empresaId,
      unidadMedida: 'UNIDAD',
    });

    // Activar LOTE
    await request(app)
      .patch(`/subpreparaciones/${sub.id}/modo-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ modoStock: 'LOTE' });

    const res = await request(app)
      .get(`/subpreparaciones?sucursalId=${sucursal.id}&busqueda=TEST_SUBPREP_LIST`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.subpreparaciones.length).toBe(1);
    const item = res.body.subpreparaciones[0];
    expect(item.receta.modoStock).toBe('LOTE');
    expect(item.receta.productoInventarioEspejo.nombre).toBe('TEST_SUBPREP_LIST');
    expect(Array.isArray(item.receta.productoInventarioEspejo.stockSucursal)).toBe(true);
  });
});

describe('expandirReceta con modo LOTE', () => {
  it('subprep usada dentro de otra receta en modo LOTE → consume del espejo', async () => {
    await cleanup();
    const empresaId = (await prisma.usuario.findFirstOrThrow({ where: { email: ADMIN.email } }))
      .empresaId as string;
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'CAR-001' },
    });

    // 1) Subprep "TEST_SUBPREP_LOTE_INNER" en modo LOTE con espejo
    const inner = await crearSubprepConReceta({
      nombre: 'TEST_SUBPREP_LOTE_INNER',
      insumoId: insumo.id,
      cantidad: 1,
      empresaId,
      unidadMedida: 'UNIDAD',
    });
    const token = await login(ADMIN);
    const lote = await request(app)
      .patch(`/subpreparaciones/${inner.id}/modo-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ modoStock: 'LOTE' });
    const espejoId = lote.body.receta.productoInventarioId as string;

    // 2) Producto vendible "TEST_SUBPREP_PARENT" cuya receta usa 2 unidades de inner
    const parent = await prisma.productoVenta.create({
      data: {
        empresaId,
        nombre: 'TEST_SUBPREP_PARENT',
        precioBase: 0n,
        esVendible: true,
        esPreparacion: false,
        receta: {
          create: {
            empresaId,
            rinde: 1,
            items: {
              create: {
                subProductoVentaId: inner.id,
                cantidad: 2,
                unidadMedida: 'UNIDAD',
              },
            },
          },
        },
      },
    });

    // 3) Expandir: debe devolver { espejoId: 2 } y NO el insumo crudo
    const consumo = await expandirReceta(prisma, parent.id, 1);
    expect(consumo.get(espejoId)).toBe(2);
    expect(consumo.get(insumo.id)).toBeUndefined();
  });

  it('ignorarModoLoteRaiz expande aunque la raíz esté en LOTE (caso producción)', async () => {
    await cleanup();
    const empresaId = (await prisma.usuario.findFirstOrThrow({ where: { email: ADMIN.email } }))
      .empresaId as string;
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'CAR-001' },
    });

    const sub = await crearSubprepConReceta({
      nombre: 'TEST_SUBPREP_LOTE_ROOT',
      insumoId: insumo.id,
      cantidad: 3,
      empresaId,
      unidadMedida: 'UNIDAD',
    });
    const token = await login(ADMIN);
    await request(app)
      .patch(`/subpreparaciones/${sub.id}/modo-stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ modoStock: 'LOTE' });

    // Sin ignorarModoLoteRaiz: descarta hasta el espejo
    const consumoVenta = await expandirReceta(prisma, sub.id, 5);
    expect(consumoVenta.has(insumo.id)).toBe(false);

    // Con ignorarModoLoteRaiz: expande a insumos crudos (5 porciones × 3 = 15 medallones)
    const consumoProduccion = await expandirReceta(prisma, sub.id, 5, {
      ignorarModoLoteRaiz: true,
    });
    expect(consumoProduccion.get(insumo.id)).toBe(15);
  });
});
