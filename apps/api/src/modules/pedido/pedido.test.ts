/**
 * Tests del módulo pedido.
 *
 * Limpia stocks/movimientos/pedidos al inicio para tener estado predecible.
 * Verifica:
 *  - Crear pedido simple, con modificadores y combo
 *  - Cálculo correcto de totales con IVA discriminado
 *  - Confirmar descuenta stock recursivamente (incluye sub-receta de salsa)
 *  - Cancelar pedido CONFIRMADO revierte el stock
 *  - Transiciones de estado válidas / inválidas
 *  - Tenant guard
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const CAJERO_CENTRO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };
const CAJERO_SLO = { email: 'cajero2@smash.com.py', password: 'Smash123!' };
const COCINA_CENTRO = { email: 'cocina1@smash.com.py', password: 'Smash123!' };

async function loginAs(creds: { email: string; password: string }) {
  const res = await request(app).post('/auth/login').send(creds);
  if (res.status !== 200)
    throw new Error(`login fallido: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

async function reset() {
  await prisma.movimientoStock.deleteMany();
  await prisma.itemPedidoComboOpcion.deleteMany();
  await prisma.itemPedidoModificador.deleteMany();
  await prisma.itemPedido.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.sucursal.updateMany({ data: { ultimoNumeroPedido: 0 } });
  // Resetear stocks a 100 unidades para todos los insumos (suficiente para tests)
  await prisma.stockSucursal.updateMany({ data: { stockActual: 1000 } });
}

async function getProductoIdPorCodigo(codigo: string) {
  const p = await prisma.productoVenta.findFirst({ where: { codigo } });
  if (!p) throw new Error(`Producto ${codigo} no encontrado`);
  return p.id;
}

describe('POST /pedidos — crear', () => {
  it('pedido simple (1 hamburguesa) → calcula precio + IVA correctamente', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');

    const res = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [{ productoVentaId: smashId, cantidad: 2 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.pedido.estado).toBe('PENDIENTE');
    expect(res.body.pedido.numero).toBeGreaterThan(0);
    // 2 × 35.000 = 70.000 con IVA incluido. IVA = 70000/11 ≈ 6364, subtotal ≈ 63636
    expect(res.body.pedido.total).toBe('70000');
    expect(res.body.pedido.totalIva).toBe('6364');
    expect(res.body.pedido.subtotal).toBe('63636');
    expect(res.body.pedido.items.length).toBe(1);
    expect(res.body.pedido.items[0].subtotal).toBe('70000');
  });

  it('pedido con modificadores → suma precioExtra al item', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');
    const grupoExtras = await prisma.modificadorGrupo.findFirstOrThrow({
      where: { nombre: 'Extras' },
    });
    const extraQueso = await prisma.modificadorOpcion.findFirstOrThrow({
      where: { modificadorGrupoId: grupoExtras.id, nombre: '+ Queso cheddar' },
    });
    const extraBacon = await prisma.modificadorOpcion.findFirstOrThrow({
      where: { modificadorGrupoId: grupoExtras.id, nombre: '+ Panceta' },
    });

    const res = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [
          {
            productoVentaId: smashId,
            cantidad: 1,
            modificadores: [
              { modificadorOpcionId: extraQueso.id }, // +5000
              { modificadorOpcionId: extraBacon.id }, // +10000
            ],
          },
        ],
      });

    expect(res.status).toBe(201);
    // 35000 + 5000 + 10000 = 50000
    expect(res.body.pedido.total).toBe('50000');
    expect(res.body.pedido.items[0].precioModificadores).toBe('15000');
    expect(res.body.pedido.items[0].modificadores.length).toBe(2);
  });

  it('pedido con combo → valida que se elija opción por cada grupo obligatorio', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const comboId = await getProductoIdPorCodigo('COMBO-SMASH');
    const combo = await prisma.combo.findFirstOrThrow({
      where: { productoVentaId: comboId },
      include: { grupos: { include: { opciones: true } } },
    });

    // Sin opciones → debería fallar
    const sinOpc = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: comboId, cantidad: 1 }] });
    expect(sinOpc.status).toBe(400);

    // Con opciones default → OK
    const opciones = combo.grupos.map((g) => ({
      comboGrupoId: g.id,
      comboGrupoOpcionId: g.opciones.find((o) => o.esDefault)!.id,
    }));
    const res = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [{ productoVentaId: comboId, cantidad: 1, combosOpcion: opciones }],
      });
    expect(res.status).toBe(201);
    // Combo Smash precio base 55000, todas opciones default = 0 extra
    expect(res.body.pedido.total).toBe('55000');
    expect(res.body.pedido.items[0].combosOpcion.length).toBe(3);
  });

  it('combo con opciones premium → suma precioExtra de la opción al precio del item', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const comboId = await getProductoIdPorCodigo('COMBO-SMASH');
    const combo = await prisma.combo.findFirstOrThrow({
      where: { productoVentaId: comboId },
      include: {
        grupos: { orderBy: { orden: 'asc' }, include: { opciones: { orderBy: { orden: 'asc' } } } },
      },
    });
    // grupo[0] = Hamburguesa: opciones [Clásica 0, Doble 8000, Bacon 5000]
    const grupoHam = combo.grupos[0]!;
    const doble = grupoHam.opciones.find((o) => o.precioExtra === 8000n)!;

    const opciones = [
      { comboGrupoId: grupoHam.id, comboGrupoOpcionId: doble.id },
      ...combo.grupos.slice(1).map((g) => ({
        comboGrupoId: g.id,
        comboGrupoOpcionId: g.opciones.find((o) => o.esDefault)!.id,
      })),
    ];

    const res = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [{ productoVentaId: comboId, cantidad: 1, combosOpcion: opciones }],
      });
    expect(res.status).toBe(201);
    // 55000 + 8000 = 63000
    expect(res.body.pedido.total).toBe('63000');
  });

  it('producto inexistente → 400', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const res = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [{ productoVentaId: 'cl000000000000000000000000', cantidad: 1 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('numeración correlativa race-free bajo carga concurrente', async () => {
    // Crea 10 pedidos en paralelo y verifica que los números asignados sean
    // exactamente 1..10 sin saltos ni duplicados — valida el optimistic lock
    // sobre Sucursal.ultimoNumeroPedido.
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const ham = await getProductoIdPorCodigo('HAM-001');

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post('/pedidos')
          .set('Authorization', `Bearer ${token}`)
          .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: ham, cantidad: 1 }] }),
      ),
    );

    for (const r of results) {
      expect(r.status).toBe(201);
    }
    const numeros = results.map((r) => r.body.pedido.numero as number).sort((a, b) => a - b);
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // El contador en Sucursal coincide con el último asignado
    const sucursal = await prisma.sucursal.findFirstOrThrow({
      where: { nombre: 'Asunción Centro' },
    });
    expect(sucursal.ultimoNumeroPedido).toBe(10);
  });
});

describe('POST /pedidos/:id/confirmar — descuento stock recursivo', () => {
  it('confirma → descuenta stock con expansión recursiva (sub-receta de Salsa)', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');

    // Stock inicial conocido: 1000 unidades para todos los insumos
    const sucursalCentro = await prisma.sucursal.findFirstOrThrow({
      where: { nombre: 'Asunción Centro' },
    });
    const insumoMayonesa = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'SAL-001' },
    });
    const insumoPan = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'PAN-001' },
    });

    const stockMayoAntes = await prisma.stockSucursal.findFirstOrThrow({
      where: { productoInventarioId: insumoMayonesa.id, sucursalId: sucursalCentro.id },
    });
    const stockPanAntes = await prisma.stockSucursal.findFirstOrThrow({
      where: { productoInventarioId: insumoPan.id, sucursalId: sucursalCentro.id },
    });

    // Crear pedido de 2 Smash Clásicas
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: smashId, cantidad: 2 }] });
    expect(crear.status).toBe(201);
    const pedidoId = crear.body.pedido.id as string;

    // Confirmar
    const conf = await request(app)
      .post(`/pedidos/${pedidoId}/confirmar`)
      .set('Authorization', `Bearer ${token}`);
    expect(conf.status).toBe(200);
    expect(conf.body.pedido.estado).toBe('CONFIRMADO');

    // Verificar stock descontado
    const stockPanDespues = await prisma.stockSucursal.findFirstOrThrow({
      where: { productoInventarioId: insumoPan.id, sucursalId: sucursalCentro.id },
    });
    const stockMayoDespues = await prisma.stockSucursal.findFirstOrThrow({
      where: { productoInventarioId: insumoMayonesa.id, sucursalId: sucursalCentro.id },
    });

    // 2 panes consumidos
    expect(Number(stockPanAntes.stockActual) - Number(stockPanDespues.stockActual)).toBe(2);
    // Mayonesa: 30ml salsa por unidad → factor 0.3 → 60ml mayonesa por batch
    // 2 unidades × 0.3 × 60ml = 36ml
    const consumoMayo = Number(stockMayoAntes.stockActual) - Number(stockMayoDespues.stockActual);
    expect(consumoMayo).toBeCloseTo(36, 2);

    // Verificar movimientos de stock creados
    const movs = await prisma.movimientoStock.findMany({ where: { pedidoId } });
    expect(movs.length).toBeGreaterThan(0);
    expect(movs.every((m) => m.tipo === 'SALIDA_VENTA')).toBe(true);
  });

  it('no se puede confirmar 2 veces el mismo pedido → 409', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: smashId, cantidad: 1 }] });
    const pedidoId = crear.body.pedido.id as string;

    await request(app)
      .post(`/pedidos/${pedidoId}/confirmar`)
      .set('Authorization', `Bearer ${token}`);
    const segundo = await request(app)
      .post(`/pedidos/${pedidoId}/confirmar`)
      .set('Authorization', `Bearer ${token}`);
    expect(segundo.status).toBe(409);
  });

  it('combo confirmado descuenta receta de cada producto elegido', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const comboId = await getProductoIdPorCodigo('COMBO-SMASH');
    const combo = await prisma.combo.findFirstOrThrow({
      where: { productoVentaId: comboId },
      include: { grupos: { include: { opciones: true } } },
    });
    const opciones = combo.grupos.map((g) => ({
      comboGrupoId: g.id,
      comboGrupoOpcionId: g.opciones.find((o) => o.esDefault)!.id,
    }));

    const sucursalCentro = await prisma.sucursal.findFirstOrThrow({
      where: { nombre: 'Asunción Centro' },
    });
    const insumoPan = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'PAN-001' },
    });
    const stockAntes = await prisma.stockSucursal.findFirstOrThrow({
      where: { productoInventarioId: insumoPan.id, sucursalId: sucursalCentro.id },
    });

    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [{ productoVentaId: comboId, cantidad: 1, combosOpcion: opciones }],
      });
    await request(app)
      .post(`/pedidos/${crear.body.pedido.id}/confirmar`)
      .set('Authorization', `Bearer ${token}`);

    const stockDespues = await prisma.stockSucursal.findFirstOrThrow({
      where: { productoInventarioId: insumoPan.id, sucursalId: sucursalCentro.id },
    });
    // El combo elegido (default) trae Smash Clásica → 1 pan
    expect(Number(stockAntes.stockActual) - Number(stockDespues.stockActual)).toBe(1);
  });
});

describe('POST /pedidos/:id/cancelar', () => {
  it('cancela PENDIENTE sin tocar stock', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: smashId, cantidad: 1 }] });

    const cancel = await request(app)
      .post(`/pedidos/${crear.body.pedido.id}/cancelar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Cliente arrepentido' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.pedido.estado).toBe('CANCELADO');

    const movs = await prisma.movimientoStock.findMany({
      where: { pedidoId: crear.body.pedido.id },
    });
    expect(movs.length).toBe(0); // ningún movimiento de stock
  });

  it('cancela CONFIRMADO → revierte stock con ENTRADA_AJUSTE', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');
    const sucursal = await prisma.sucursal.findFirstOrThrow({
      where: { nombre: 'Asunción Centro' },
    });
    const insumoPan = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'PAN-001' },
    });

    const stockInicial = await prisma.stockSucursal.findFirstOrThrow({
      where: { productoInventarioId: insumoPan.id, sucursalId: sucursal.id },
    });

    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: smashId, cantidad: 3 }] });

    await request(app)
      .post(`/pedidos/${crear.body.pedido.id}/confirmar`)
      .set('Authorization', `Bearer ${token}`);

    const cancel = await request(app)
      .post(`/pedidos/${crear.body.pedido.id}/cancelar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Error en el pedido' });
    expect(cancel.status).toBe(200);

    // Stock debe estar igual que al inicio
    const stockFinal = await prisma.stockSucursal.findFirstOrThrow({
      where: { productoInventarioId: insumoPan.id, sucursalId: sucursal.id },
    });
    expect(Number(stockFinal.stockActual)).toBe(Number(stockInicial.stockActual));

    // Debe haber 2 movimientos: SALIDA_VENTA + ENTRADA_AJUSTE
    const movsPan = await prisma.movimientoStock.findMany({
      where: { pedidoId: crear.body.pedido.id, productoInventarioId: insumoPan.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(movsPan.length).toBe(2);
    expect(movsPan[0]!.tipo).toBe('SALIDA_VENTA');
    expect(movsPan[1]!.tipo).toBe('ENTRADA_AJUSTE');
  });

  it('no se puede cancelar un pedido FACTURADO → 409', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: smashId, cantidad: 1 }] });
    const pedidoId = crear.body.pedido.id as string;

    // Avanzar hasta FACTURADO via transitions
    await request(app)
      .post(`/pedidos/${pedidoId}/confirmar`)
      .set('Authorization', `Bearer ${token}`);
    for (const estado of ['EN_PREPARACION', 'LISTO', 'ENTREGADO', 'FACTURADO']) {
      const t = await request(app)
        .patch(`/pedidos/${pedidoId}/estado`)
        .set('Authorization', `Bearer ${token}`)
        .send({ estado });
      expect(t.status).toBe(200);
    }

    const cancel = await request(app)
      .post(`/pedidos/${pedidoId}/cancelar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'no debería' });
    expect(cancel.status).toBe(409);
  });
});

describe('PATCH /pedidos/:id/estado — transiciones', () => {
  it('PENDIENTE → ENTREGADO directo está bloqueado (transición inválida)', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: smashId, cantidad: 1 }] });

    const t = await request(app)
      .patch(`/pedidos/${crear.body.pedido.id}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'ENTREGADO' });
    expect(t.status).toBe(409);
  });

  it('CONFIRMADO → EN_PREPARACION → LISTO secuencia válida', async () => {
    await reset();
    const tCajero = await loginAs(CAJERO_CENTRO);
    const tCocina = await loginAs(COCINA_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: smashId, cantidad: 1 }] });
    const id = crear.body.pedido.id;

    await request(app).post(`/pedidos/${id}/confirmar`).set('Authorization', `Bearer ${tCajero}`);

    const t1 = await request(app)
      .patch(`/pedidos/${id}/estado`)
      .set('Authorization', `Bearer ${tCocina}`)
      .send({ estado: 'EN_PREPARACION' });
    expect(t1.status).toBe(200);
    expect(t1.body.pedido.enPreparacionEn).toBeTruthy();

    const t2 = await request(app)
      .patch(`/pedidos/${id}/estado`)
      .set('Authorization', `Bearer ${tCocina}`)
      .send({ estado: 'LISTO' });
    expect(t2.status).toBe(200);
    expect(t2.body.pedido.listoEn).toBeTruthy();
  });
});

describe('POST /pedidos/:id/items — cuenta abierta de mesa', () => {
  it('agrega items a pedido CONFIRMADO y suma totales + descuenta stock', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');
    const dobleId = await getProductoIdPorCodigo('HAM-002');

    // Crear pedido con 1 hamburguesa y confirmarlo
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: smashId, cantidad: 1 }] });
    const id = crear.body.pedido.id;
    const totalInicial = BigInt(crear.body.pedido.total);
    await request(app).post(`/pedidos/${id}/confirmar`).set('Authorization', `Bearer ${token}`);

    // Stock antes del segundo round
    const sucCentro = await prisma.sucursal.findFirstOrThrow({
      where: { nombre: 'Asunción Centro' },
    });
    const insumoPan = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'PAN-001' },
    });
    const stockPanAntes = await prisma.stockSucursal.findFirstOrThrow({
      where: { sucursalId: sucCentro.id, productoInventarioId: insumoPan.id },
    });

    // Round 2: agregar 2 doble + 1 smash
    const agregar = await request(app)
      .post(`/pedidos/${id}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { productoVentaId: dobleId, cantidad: 2 },
          { productoVentaId: smashId, cantidad: 1 },
        ],
      });
    expect(agregar.status).toBe(200);
    expect(agregar.body.pedido.items.length).toBeGreaterThanOrEqual(3);

    // Total nuevo = total inicial + (2 dobles) + (1 smash)
    expect(BigInt(agregar.body.pedido.total)).toBeGreaterThan(totalInicial);

    // Los items nuevos deben estar en CONFIRMADO (porque el pedido ya estaba confirmado)
    const itemsNuevos = agregar.body.pedido.items.filter(
      (it: { estado: string }) => it.estado === 'CONFIRMADO',
    );
    expect(itemsNuevos.length).toBeGreaterThanOrEqual(2);

    // Stock descontado en el round 2 (cada hamburguesa usa pan)
    const stockPanDespues = await prisma.stockSucursal.findFirstOrThrow({
      where: { sucursalId: sucCentro.id, productoInventarioId: insumoPan.id },
    });
    expect(
      Number(stockPanAntes.stockActual) - Number(stockPanDespues.stockActual),
    ).toBeGreaterThanOrEqual(3);
  });

  it('a un pedido PENDIENTE: items quedan PENDIENTE (sin descontar stock)', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: smashId, cantidad: 1 }] });
    const id = crear.body.pedido.id;
    // NO confirmamos

    const sucCentro = await prisma.sucursal.findFirstOrThrow({
      where: { nombre: 'Asunción Centro' },
    });
    const insumoPan = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'PAN-001' },
    });
    const stockAntes = await prisma.stockSucursal.findFirstOrThrow({
      where: { sucursalId: sucCentro.id, productoInventarioId: insumoPan.id },
    });

    const agregar = await request(app)
      .post(`/pedidos/${id}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productoVentaId: smashId, cantidad: 1 }] });
    expect(agregar.status).toBe(200);

    // Stock NO debe haber cambiado
    const stockDespues = await prisma.stockSucursal.findFirstOrThrow({
      where: { sucursalId: sucCentro.id, productoInventarioId: insumoPan.id },
    });
    expect(stockDespues.stockActual.toString()).toBe(stockAntes.stockActual.toString());
  });

  it('a un pedido LISTO: lo regresa a EN_PREPARACION', async () => {
    await reset();
    const tCajero = await loginAs(CAJERO_CENTRO);
    const tCocina = await loginAs(COCINA_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: smashId, cantidad: 1 }] });
    const id = crear.body.pedido.id;
    await request(app).post(`/pedidos/${id}/confirmar`).set('Authorization', `Bearer ${tCajero}`);
    await request(app)
      .patch(`/pedidos/${id}/estado`)
      .set('Authorization', `Bearer ${tCocina}`)
      .send({ estado: 'EN_PREPARACION' });
    await request(app)
      .patch(`/pedidos/${id}/estado`)
      .set('Authorization', `Bearer ${tCocina}`)
      .send({ estado: 'LISTO' });

    const agregar = await request(app)
      .post(`/pedidos/${id}/items`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ items: [{ productoVentaId: smashId, cantidad: 1 }] });
    expect(agregar.status).toBe(200);
    expect(agregar.body.pedido.estado).toBe('EN_PREPARACION');
  });

  it('a un pedido FACTURADO → 409', async () => {
    await reset();
    const token = await loginAs(CAJERO_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');

    // Abrir caja para poder facturar
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    const caja1 = cajas.body.cajas.find((c: { nombre: string }) => c.nombre === 'Caja 1');
    await request(app)
      .post(`/cajas/${caja1.id}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 100000 });

    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: smashId, cantidad: 1 }] });
    const id = crear.body.pedido.id;
    await request(app).post(`/pedidos/${id}/confirmar`).set('Authorization', `Bearer ${token}`);
    await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId: id,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(crear.body.pedido.total) }],
      });

    const agregar = await request(app)
      .post(`/pedidos/${id}/items`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productoVentaId: smashId, cantidad: 1 }] });
    expect(agregar.status).toBe(409);
    expect(agregar.body.error.message).toMatch(/FACTURADO/);
  });

  it('cajero de otra empresa → 403', async () => {
    await reset();
    const tCentro = await loginAs(CAJERO_CENTRO);
    const tSlo = await loginAs(CAJERO_SLO);
    const smashId = await getProductoIdPorCodigo('HAM-001');
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${tCentro}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: smashId, cantidad: 1 }] });

    const res = await request(app)
      .post(`/pedidos/${crear.body.pedido.id}/items`)
      .set('Authorization', `Bearer ${tSlo}`)
      .send({ items: [{ productoVentaId: smashId, cantidad: 1 }] });
    expect([403, 404]).toContain(res.status);
  });
});

describe('Tenant guard', () => {
  it('cajero de SLO no puede ver pedido de Centro → 403/404', async () => {
    await reset();
    const tCajero1 = await loginAs(CAJERO_CENTRO);
    const smashId = await getProductoIdPorCodigo('HAM-001');
    const crear = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${tCajero1}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: smashId, cantidad: 1 }] });

    const tCajero2 = await loginAs(CAJERO_SLO);
    const res = await request(app)
      .get(`/pedidos/${crear.body.pedido.id}`)
      .set('Authorization', `Bearer ${tCajero2}`);
    expect([403, 404]).toContain(res.status);
  });
});

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});
