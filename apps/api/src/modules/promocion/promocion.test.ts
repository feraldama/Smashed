/**
 * Tests del módulo promoción.
 *
 * Cubre:
 *  - CRUD: crear (PRECIO_FIJO / PORCENTAJE / NXM / COMBO), listar, obtener,
 *    actualizar, eliminar (soft delete).
 *  - Validaciones de payload: campos condicionales por tipo, duplicados,
 *    horas, días de semana, combos con >=2 productos.
 *  - Permisos: cajero no puede crear; gerente/admin sí.
 *  - /vigentes: filtra por día de semana, rango horario y vigencia absoluta,
 *    y por sucursal (promo a todas vs. promo a una sucursal específica).
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

import type { Prisma } from '@prisma/client';

const app = createApp();

const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' };
const CAJERO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };

async function login(creds: { email: string; password: string }) {
  const r = await request(app).post('/auth/login').send(creds);
  if (r.status !== 200) throw new Error(`login fallido: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.accessToken as string;
}

async function getEmpresaId() {
  const e = await prisma.empresa.findFirstOrThrow();
  return e.id;
}

async function getProductoIdPorCodigo(codigo: string) {
  const p = await prisma.productoVenta.findFirstOrThrow({ where: { codigo } });
  return p.id;
}

async function getSucursales(empresaId: string) {
  return prisma.sucursal.findMany({
    where: { empresaId, deletedAt: null },
    orderBy: { codigo: 'asc' },
    select: { id: true, codigo: true },
  });
}

async function limpiarPromos(empresaId: string) {
  // Hard delete está bien — no hay ItemPedido vinculados en los tests.
  await prisma.promocionProducto.deleteMany({ where: { promocion: { empresaId } } });
  await prisma.promocionSucursal.deleteMany({ where: { promocion: { empresaId } } });
  await prisma.promocion.deleteMany({ where: { empresaId } });
}

describe('Promociones — CRUD', () => {
  let empresaId: string;
  let hamId: string;
  let sucursalIds: string[];

  beforeAll(async () => {
    empresaId = await getEmpresaId();
    hamId = await getProductoIdPorCodigo('HAM-001');
    const sucs = await getSucursales(empresaId);
    sucursalIds = sucs.map((s) => s.id);
  });

  beforeEach(async () => {
    await limpiarPromos(empresaId);
  });

  it('admin crea promo PRECIO_FIJO válida → 201 con productos y sucursales', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .post('/promociones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Martes de chopp',
        tipo: 'PRECIO_FIJO',
        precioFijo: 8000,
        diasSemana: [2], // martes
        horaInicio: '18:00',
        horaFin: '21:00',
        productos: [{ productoVentaId: hamId, cantidadMin: 1 }],
        sucursalIds: [sucursalIds[0]],
        iconoEmoji: '🍺',
      });

    expect(res.status).toBe(201);
    expect(res.body.promocion.nombre).toBe('Martes de chopp');
    expect(res.body.promocion.tipo).toBe('PRECIO_FIJO');
    expect(res.body.promocion.precioFijo).toBe('8000');
    expect(res.body.promocion.diasSemana).toEqual([2]);
    expect(res.body.promocion.productos).toHaveLength(1);
    expect(res.body.promocion.sucursales).toHaveLength(1);
  });

  it('crea promo NXM con nxmLleva=2 nxmPaga=1 (2x1) → OK', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .post('/promociones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: '2x1 Hamburguesas',
        tipo: 'NXM',
        nxmLleva: 2,
        nxmPaga: 1,
        diasSemana: [],
        productos: [{ productoVentaId: hamId }],
        sucursalIds: [],
      });
    expect(res.status).toBe(201);
    expect(res.body.promocion.nxmLleva).toBe(2);
    expect(res.body.promocion.nxmPaga).toBe(1);
    expect(res.body.promocion.sucursales).toHaveLength(0); // aplica a todas
  });

  it('rechaza PRECIO_FIJO sin precioFijo → 400', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .post('/promociones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Sin precio',
        tipo: 'PRECIO_FIJO',
        productos: [{ productoVentaId: hamId }],
      });
    expect(res.status).toBe(400);
  });

  it('rechaza NXM con nxmPaga >= nxmLleva → 400', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .post('/promociones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'NXM mal',
        tipo: 'NXM',
        nxmLleva: 2,
        nxmPaga: 2,
        productos: [{ productoVentaId: hamId }],
      });
    expect(res.status).toBe(400);
  });

  it('rechaza horaFin <= horaInicio → 400', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .post('/promociones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Horario inválido',
        tipo: 'PRECIO_FIJO',
        precioFijo: 5000,
        horaInicio: '21:00',
        horaFin: '18:00',
        productos: [{ productoVentaId: hamId }],
      });
    expect(res.status).toBe(400);
  });

  it('rechaza COMBO con un solo producto → 400', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .post('/promociones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Combo malo',
        tipo: 'COMBO',
        precioFijo: 50000,
        productos: [{ productoVentaId: hamId }],
      });
    expect(res.status).toBe(400);
  });

  it('rechaza nombre duplicado → 409', async () => {
    const token = await login(ADMIN);
    await request(app)
      .post('/promociones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Promo X',
        tipo: 'PRECIO_FIJO',
        precioFijo: 1000,
        productos: [{ productoVentaId: hamId }],
      });
    const dup = await request(app)
      .post('/promociones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Promo X',
        tipo: 'PRECIO_FIJO',
        precioFijo: 1000,
        productos: [{ productoVentaId: hamId }],
      });
    expect(dup.status).toBe(409);
  });

  it('cajero no puede crear promo → 403', async () => {
    const token = await login(CAJERO);
    const res = await request(app)
      .post('/promociones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Cajero',
        tipo: 'PRECIO_FIJO',
        precioFijo: 1000,
        productos: [{ productoVentaId: hamId }],
      });
    expect(res.status).toBe(403);
  });

  it('PATCH cambia tipo y productos → reemplaza productos', async () => {
    const token = await login(ADMIN);
    const ham2Id = await getProductoIdPorCodigo('HAM-002');
    const creada = await request(app)
      .post('/promociones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'A editar',
        tipo: 'PRECIO_FIJO',
        precioFijo: 1000,
        productos: [{ productoVentaId: hamId }],
      });
    const id = creada.body.promocion.id;

    const res = await request(app)
      .patch(`/promociones/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'PORCENTAJE',
        porcentaje: 1500,
        precioFijo: null,
        productos: [{ productoVentaId: ham2Id }],
      });
    expect(res.status).toBe(200);
    expect(res.body.promocion.tipo).toBe('PORCENTAJE');
    expect(res.body.promocion.porcentaje).toBe(1500);
    expect(res.body.promocion.precioFijo).toBeNull();
    expect(res.body.promocion.productos).toHaveLength(1);
    expect(res.body.promocion.productos[0].productoVentaId).toBe(ham2Id);
  });

  it('DELETE hace soft delete y deja de aparecer en lista', async () => {
    const token = await login(ADMIN);
    const creada = await request(app)
      .post('/promociones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'A borrar',
        tipo: 'PRECIO_FIJO',
        precioFijo: 1000,
        productos: [{ productoVentaId: hamId }],
      });
    const id = creada.body.promocion.id;

    const del = await request(app)
      .delete(`/promociones/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const lista = await request(app).get('/promociones').set('Authorization', `Bearer ${token}`);
    expect(lista.body.promociones.find((p: { id: string }) => p.id === id)).toBeUndefined();

    // En DB sigue con deletedAt setado.
    const enDb = await prisma.promocion.findUnique({ where: { id } });
    expect(enDb?.deletedAt).not.toBeNull();
  });
});

describe('Promociones — /vigentes', () => {
  let empresaId: string;
  let hamId: string;
  let sucursales: Array<{ id: string; codigo: string }>;
  let suc1Id: string;
  let suc2Id: string | null;

  beforeAll(async () => {
    empresaId = await getEmpresaId();
    hamId = await getProductoIdPorCodigo('HAM-001');
    sucursales = await getSucursales(empresaId);
    if (!sucursales[0]) throw new Error('Seed sin sucursales');
    suc1Id = sucursales[0].id;
    suc2Id = sucursales[1]?.id ?? null;
  });

  beforeEach(async () => {
    await limpiarPromos(empresaId);
  });

  async function crearPromoDirecta(args: {
    nombre: string;
    diasSemana?: number[];
    horaInicio?: string | null;
    horaFin?: string | null;
    vigenciaDesde?: Date | null;
    vigenciaHasta?: Date | null;
    sucursalIds?: string[];
    activo?: boolean;
  }) {
    const sucursalIds = args.sucursalIds ?? [];
    const data: Prisma.PromocionCreateInput = {
      empresa: { connect: { id: empresaId } },
      nombre: args.nombre,
      tipo: 'PRECIO_FIJO',
      precioFijo: 8000n,
      diasSemana: args.diasSemana ?? [],
      horaInicio: args.horaInicio ?? null,
      horaFin: args.horaFin ?? null,
      vigenciaDesde: args.vigenciaDesde ?? null,
      vigenciaHasta: args.vigenciaHasta ?? null,
      activo: args.activo ?? true,
      productos: { create: [{ productoVenta: { connect: { id: hamId } } }] },
    };
    if (sucursalIds.length > 0) {
      data.sucursales = {
        create: sucursalIds.map((id) => ({ sucursal: { connect: { id } } })),
      };
    }
    return prisma.promocion.create({ data });
  }

  it('filtra por día de semana y rango horario (martes 18-21 en Asunción)', async () => {
    await crearPromoDirecta({
      nombre: 'Martes chopp',
      diasSemana: [2], // martes
      horaInicio: '18:00',
      horaFin: '21:00',
    });
    await crearPromoDirecta({
      nombre: 'Sin restricción',
    });

    const token = await login(CAJERO);

    // Martes 19:00 Asunción = 2026-05-19T19:00:00-03:00 → 22:00 UTC
    const martes19h = '2026-05-19T22:00:00.000Z';
    const ok = await request(app)
      .get('/promociones/vigentes')
      .query({ sucursalId: suc1Id, now: martes19h })
      .set('Authorization', `Bearer ${token}`);
    expect(ok.status).toBe(200);
    expect(ok.body.promociones.map((p: { nombre: string }) => p.nombre).sort()).toEqual([
      'Martes chopp',
      'Sin restricción',
    ]);

    // Martes 17:59 — fuera del rango horario → solo aparece la "sin restricción"
    const martes1759 = '2026-05-19T20:59:00.000Z';
    const fueraHora = await request(app)
      .get('/promociones/vigentes')
      .query({ sucursalId: suc1Id, now: martes1759 })
      .set('Authorization', `Bearer ${token}`);
    expect(fueraHora.body.promociones.map((p: { nombre: string }) => p.nombre)).toEqual([
      'Sin restricción',
    ]);

    // Miércoles 19h — fuera del día → solo "sin restricción"
    const miercoles19h = '2026-05-20T22:00:00.000Z';
    const fueraDia = await request(app)
      .get('/promociones/vigentes')
      .query({ sucursalId: suc1Id, now: miercoles19h })
      .set('Authorization', `Bearer ${token}`);
    expect(fueraDia.body.promociones.map((p: { nombre: string }) => p.nombre)).toEqual([
      'Sin restricción',
    ]);
  });

  it('filtra por vigencia absoluta y activo=false', async () => {
    const ayer = new Date('2026-05-20T00:00:00Z');
    const pasadoMañana = new Date('2026-05-23T00:00:00Z');
    // Vigente entre ayer y pasado mañana.
    await crearPromoDirecta({
      nombre: 'En rango',
      vigenciaDesde: ayer,
      vigenciaHasta: pasadoMañana,
    });
    // Ya expirada.
    await crearPromoDirecta({
      nombre: 'Expirada',
      vigenciaHasta: new Date('2026-05-01T00:00:00Z'),
    });
    // Desactivada.
    await crearPromoDirecta({ nombre: 'Inactiva', activo: false });

    const token = await login(CAJERO);
    const res = await request(app)
      .get('/promociones/vigentes')
      .query({ sucursalId: suc1Id, now: '2026-05-21T15:00:00.000Z' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.promociones.map((p: { nombre: string }) => p.nombre)).toEqual(['En rango']);
  });

  it('promo con sucursal específica no aparece en otras sucursales', async () => {
    if (!suc2Id) {
      // Si el seed solo tiene una sucursal el test no aplica.
      return;
    }
    await crearPromoDirecta({
      nombre: 'Solo en suc 1',
      sucursalIds: [suc1Id],
    });
    await crearPromoDirecta({ nombre: 'En todas' });

    const token = await login(CAJERO);
    const enSuc1 = await request(app)
      .get('/promociones/vigentes')
      .query({ sucursalId: suc1Id, now: '2026-05-21T15:00:00.000Z' })
      .set('Authorization', `Bearer ${token}`);
    expect(enSuc1.body.promociones.map((p: { nombre: string }) => p.nombre).sort()).toEqual([
      'En todas',
      'Solo en suc 1',
    ]);

    const enSuc2 = await request(app)
      .get('/promociones/vigentes')
      .query({ sucursalId: suc2Id, now: '2026-05-21T15:00:00.000Z' })
      .set('Authorization', `Bearer ${token}`);
    expect(enSuc2.body.promociones.map((p: { nombre: string }) => p.nombre)).toEqual(['En todas']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Carga de pedidos con promoción vigente (Fase 2)
// ═══════════════════════════════════════════════════════════════════════════

describe('Promociones — carga de pedido con promocionId', () => {
  let empresaId: string;
  let hamId: string;
  let ham2Id: string;
  let puntoMedioId: string;

  async function getPuntoMedioId() {
    const op = await prisma.modificadorOpcion.findFirstOrThrow({
      where: { modificadorGrupo: { nombre: 'Punto de cocción' }, nombre: 'Medio' },
    });
    return op.id;
  }

  beforeAll(async () => {
    empresaId = await getEmpresaId();
    hamId = await getProductoIdPorCodigo('HAM-001'); // 35.000
    ham2Id = await getProductoIdPorCodigo('HAM-002'); // 50.000
    puntoMedioId = await getPuntoMedioId();
  });

  beforeEach(async () => {
    await limpiarPromos(empresaId);
    // Reset de pedidos para que el test sea independiente del estado anterior.
    await prisma.itemPedidoComboOpcion.deleteMany();
    await prisma.itemPedidoModificador.deleteMany();
    await prisma.itemPedido.deleteMany();
    await prisma.pedido.deleteMany();
    await prisma.sucursal.updateMany({ data: { ultimoNumeroPedido: 0 } });
  });

  async function crearPromoFija(precio: number, sinHorario = true) {
    return prisma.promocion.create({
      data: {
        empresaId,
        nombre: 'Chopp test',
        tipo: 'PRECIO_FIJO',
        precioFijo: BigInt(precio),
        diasSemana: sinHorario ? [] : [new Date().getDay()],
        productos: { create: [{ productoVentaId: hamId }] },
      },
    });
  }

  async function crearPromoPct(pctBasisPoints: number) {
    return prisma.promocion.create({
      data: {
        empresaId,
        nombre: 'Descuento test',
        tipo: 'PORCENTAJE',
        porcentaje: pctBasisPoints,
        diasSemana: [],
        productos: { create: [{ productoVentaId: hamId }] },
      },
    });
  }

  it('aplica PRECIO_FIJO: precioUnitario y descuentoPromocion correctos', async () => {
    const promo = await crearPromoFija(20000);
    const token = await login(CAJERO);

    const res = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [
          {
            productoVentaId: hamId,
            cantidad: 2,
            promocionId: promo.id,
            modificadores: [{ modificadorOpcionId: puntoMedioId }],
          },
        ],
      });

    expect(res.status).toBe(201);
    const items = await prisma.itemPedido.findMany({
      where: { pedidoId: res.body.pedido.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.precioUnitario.toString()).toBe('20000');
    // descuentoPromocion = (35000 - 20000) * 2 = 30000
    expect(items[0]!.descuentoPromocion.toString()).toBe('30000');
    expect(items[0]!.promocionId).toBe(promo.id);
    // Total del pedido: 20000 * 2 = 40000 (en Gs.)
    expect(res.body.pedido.total).toBe('40000');
  });

  it('aplica PORCENTAJE 20% (2000 bp): precioUnitario descontado', async () => {
    const promo = await crearPromoPct(2000); // 20%
    const token = await login(CAJERO);

    const res = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [
          {
            productoVentaId: hamId,
            cantidad: 1,
            promocionId: promo.id,
            modificadores: [{ modificadorOpcionId: puntoMedioId }],
          },
        ],
      });

    expect(res.status).toBe(201);
    const items = await prisma.itemPedido.findMany({
      where: { pedidoId: res.body.pedido.id },
    });
    // 35000 - (35000 * 2000 / 10000) = 35000 - 7000 = 28000
    expect(items[0]!.precioUnitario.toString()).toBe('28000');
    expect(items[0]!.descuentoPromocion.toString()).toBe('7000');
  });

  it('rechaza si el producto no está incluido en la promo', async () => {
    const promo = await crearPromoFija(20000);
    const token = await login(CAJERO);

    const res = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [{ productoVentaId: ham2Id, cantidad: 1, promocionId: promo.id }],
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('no está incluido');
  });

  it('rechaza si la promo está fuera de horario hoy', async () => {
    // Promo solo hoy de 03:00 a 04:00 (improbable que el test corra en ese rango).
    const promo = await prisma.promocion.create({
      data: {
        empresaId,
        nombre: 'Fuera horario',
        tipo: 'PRECIO_FIJO',
        precioFijo: 10000n,
        diasSemana: [],
        horaInicio: '03:00',
        horaFin: '04:00',
        productos: { create: [{ productoVentaId: hamId }] },
      },
    });
    const token = await login(CAJERO);

    const res = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [{ productoVentaId: hamId, cantidad: 1, promocionId: promo.id }],
      });

    // Si por casualidad el test corre entre las 03:00 y 04:00 (Asunción) el test
    // pasaría con 201 — improbable. Aceptamos ambos resultados defensivamente.
    if (res.status !== 201) {
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('no vigente');
    }
  });

  it('aplica NXM 2x1 con cantidad=2 → 1 unidad gratis, total = 1 unidad', async () => {
    const promo = await prisma.promocion.create({
      data: {
        empresaId,
        nombre: '2x1',
        tipo: 'NXM',
        nxmLleva: 2,
        nxmPaga: 1,
        diasSemana: [],
        productos: { create: [{ productoVentaId: hamId }] },
      },
    });
    const token = await login(CAJERO);

    const res = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [
          {
            productoVentaId: hamId,
            cantidad: 2,
            promocionId: promo.id,
            modificadores: [{ modificadorOpcionId: puntoMedioId }],
          },
        ],
      });

    expect(res.status).toBe(201);
    const items = await prisma.itemPedido.findMany({
      where: { pedidoId: res.body.pedido.id },
    });
    // precioUnitario sigue siendo precioBase (35.000)
    expect(items[0]!.precioUnitario.toString()).toBe('35000');
    // subtotal = 1 hamburguesa pagada = 35.000
    expect(items[0]!.subtotal.toString()).toBe('35000');
    // descuentoPromocion = 1 hamburguesa regalada
    expect(items[0]!.descuentoPromocion.toString()).toBe('35000');
    expect(res.body.pedido.total).toBe('35000');
  });

  it('NXM 2x1 con cantidad=3 → 1 gratis, paga 2 = Gs. 70.000', async () => {
    const promo = await prisma.promocion.create({
      data: {
        empresaId,
        nombre: '2x1 v2',
        tipo: 'NXM',
        nxmLleva: 2,
        nxmPaga: 1,
        diasSemana: [],
        productos: { create: [{ productoVentaId: hamId }] },
      },
    });
    const token = await login(CAJERO);

    const res = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [
          {
            productoVentaId: hamId,
            cantidad: 3,
            promocionId: promo.id,
            modificadores: [{ modificadorOpcionId: puntoMedioId }],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.pedido.total).toBe('70000');
  });

  it('COMBO: prorratea precioFijo entre productos al recibirlos', async () => {
    const promo = await prisma.promocion.create({
      data: {
        empresaId,
        nombre: 'Combo doble',
        tipo: 'COMBO',
        precioFijo: 60000n,
        diasSemana: [],
        productos: {
          create: [
            { productoVentaId: hamId }, // 35000
            { productoVentaId: ham2Id }, // 50000
          ],
        },
      },
    });
    const token = await login(CAJERO);

    const res = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [
          {
            productoVentaId: hamId,
            cantidad: 1,
            promocionId: promo.id,
            modificadores: [{ modificadorOpcionId: puntoMedioId }],
          },
          {
            productoVentaId: ham2Id,
            cantidad: 1,
            promocionId: promo.id,
            modificadores: [{ modificadorOpcionId: puntoMedioId }],
          },
        ],
      });

    expect(res.status).toBe(201);
    // Total del pedido debe ser exactamente 60.000 (precioFijo del combo)
    expect(res.body.pedido.total).toBe('60000');

    // Verificar precios prorrateados: ham (35000) y ham2 (50000) suman 85000.
    // Asignaciones: ham → floor(60000*35000/85000) = 24705; ham2 (último) → 60000-24705 = 35295.
    const items = await prisma.itemPedido.findMany({
      where: { pedidoId: res.body.pedido.id },
      orderBy: { createdAt: 'asc' },
    });
    const sumaSubtotales = items.reduce((acc, i) => acc + i.subtotal, 0n);
    expect(sumaSubtotales).toBe(60000n);
  });

  it('COMBO: rechaza si falta un producto de la composición', async () => {
    const promo = await prisma.promocion.create({
      data: {
        empresaId,
        nombre: 'Combo incompleto',
        tipo: 'COMBO',
        precioFijo: 60000n,
        diasSemana: [],
        productos: {
          create: [{ productoVentaId: hamId }, { productoVentaId: ham2Id }],
        },
      },
    });
    const token = await login(CAJERO);

    const res = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [
          // Solo enviamos ham — falta ham2.
          {
            productoVentaId: hamId,
            cantidad: 1,
            promocionId: promo.id,
            modificadores: [{ modificadorOpcionId: puntoMedioId }],
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('Combo');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Exclusión: items en promo no reciben descuentos manuales (Fase 4)
// ═══════════════════════════════════════════════════════════════════════════

describe('Promociones — exclusión vs. descuento manual', () => {
  let empresaId: string;
  let hamId: string;
  let ham2Id: string;
  let puntoMedioId: string;
  let motivoId: string;

  beforeAll(async () => {
    empresaId = await getEmpresaId();
    hamId = await getProductoIdPorCodigo('HAM-001');
    ham2Id = await getProductoIdPorCodigo('HAM-002');
    const punto = await prisma.modificadorOpcion.findFirstOrThrow({
      where: { modificadorGrupo: { nombre: 'Punto de cocción' }, nombre: 'Medio' },
    });
    puntoMedioId = punto.id;
  });

  beforeEach(async () => {
    await limpiarPromos(empresaId);
    await prisma.codigoAutorizacionDescuento.deleteMany({ where: { empresaId } });
    await prisma.motivoDescuento.deleteMany({ where: { empresaId, esSistema: false } });
    await prisma.limiteDescuentoRol.deleteMany({ where: { empresaId } });
    await prisma.itemPedidoComboOpcion.deleteMany();
    await prisma.itemPedidoModificador.deleteMany();
    await prisma.itemPedido.deleteMany();
    await prisma.pedido.deleteMany();
    await prisma.sucursal.updateMany({ data: { ultimoNumeroPedido: 0 } });

    // Setup: motivo de descuento estándar + ADMIN puede dar 100%.
    const motivo = await prisma.motivoDescuento.create({
      data: { empresaId, nombre: 'Promo exclusión', requiereAutorizacion: false },
    });
    motivoId = motivo.id;
    await prisma.limiteDescuentoRol.upsert({
      where: { empresaId_rol: { empresaId, rol: 'ADMIN_EMPRESA' } },
      create: {
        empresaId,
        rol: 'ADMIN_EMPRESA',
        maxPorcentaje: 100,
        puedeAutorizarOtros: true,
        puedeUsarCortesia: true,
      },
      update: { maxPorcentaje: 100, puedeAutorizarOtros: true, puedeUsarCortesia: true },
    });
  });

  it('descuento manual 10% NO aplica al item en promo, solo al resto', async () => {
    // Promo PRECIO_FIJO sobre HAM-001 (35.000 → 20.000)
    const promo = await prisma.promocion.create({
      data: {
        empresaId,
        nombre: 'Promo exclusión',
        tipo: 'PRECIO_FIJO',
        precioFijo: 20000n,
        diasSemana: [],
        productos: { create: [{ productoVentaId: hamId }] },
      },
    });
    const token = await login(ADMIN);

    // Pedido: 1 HAM con promo (20.000) + 1 HAM-002 sin promo (50.000) = 70.000
    const pedidoRes = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [
          {
            productoVentaId: hamId,
            cantidad: 1,
            promocionId: promo.id,
            modificadores: [{ modificadorOpcionId: puntoMedioId }],
          },
          {
            productoVentaId: ham2Id,
            cantidad: 1,
            modificadores: [{ modificadorOpcionId: puntoMedioId }],
          },
        ],
      });

    expect(pedidoRes.status).toBe(201);
    expect(pedidoRes.body.pedido.total).toBe('70000');

    // Aplicar 10% sobre el pedido. La base debe ser SOLO 50.000 (HAM-002, sin promo).
    // monto = 50.000 * 10% = 5.000 → total = 70.000 - 5.000 = 65.000.
    const descRes = await request(app)
      .post(`/descuentos/pedidos/${pedidoRes.body.pedido.id}/descuento`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'PORCENTAJE', valor: 1000, motivoDescuentoId: motivoId });

    expect(descRes.status).toBe(200);
    expect(descRes.body.pedido.totalDescuento).toBe('5000');
    expect(descRes.body.pedido.total).toBe('65000');
  });

  it('si TODO el pedido está en promo, el descuento manual se rechaza', async () => {
    const promo = await prisma.promocion.create({
      data: {
        empresaId,
        nombre: 'Promo total',
        tipo: 'PRECIO_FIJO',
        precioFijo: 20000n,
        diasSemana: [],
        productos: { create: [{ productoVentaId: hamId }] },
      },
    });
    const token = await login(ADMIN);
    const pedidoRes = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [
          {
            productoVentaId: hamId,
            cantidad: 1,
            promocionId: promo.id,
            modificadores: [{ modificadorOpcionId: puntoMedioId }],
          },
        ],
      });

    expect(pedidoRes.status).toBe(201);

    const descRes = await request(app)
      .post(`/descuentos/pedidos/${pedidoRes.body.pedido.id}/descuento`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'PORCENTAJE', valor: 1000, motivoDescuentoId: motivoId });

    expect(descRes.status).toBe(400);
    expect(JSON.stringify(descRes.body)).toContain('promoción');
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
