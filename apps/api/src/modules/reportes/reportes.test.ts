/**
 * Tests del módulo reportes.
 *
 * Genera 2 comprobantes con sus pedidos y verifica que los reportes
 * agregan correctamente. Limpia al finalizar.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' };
const CAJERO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };

async function login(creds: { email: string; password: string }) {
  const r = await request(app).post('/auth/login').send(creds);
  return r.body.accessToken as string;
}

const ids: { pedidos: string[]; comprobantes: string[]; aperturas: string[] } = {
  pedidos: [],
  comprobantes: [],
  aperturas: [],
};

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
  ids.pedidos = [];
  ids.comprobantes = [];
  ids.aperturas = [];
}

// Inyecta opciones de modificadores obligatorios (ej: "Punto de cocción") que
// el servicio de pedidos exige para hamburguesas/lomitos.
async function modificadoresObligatoriosDe(productoVentaId: string) {
  const grupos = await prisma.productoVentaModificadorGrupo.findMany({
    where: { productoVentaId, modificadorGrupo: { obligatorio: true } },
    select: {
      modificadorGrupo: {
        select: { opciones: { take: 1, orderBy: { orden: 'asc' }, select: { id: true } } },
      },
    },
  });
  return grupos.flatMap((g) =>
    g.modificadorGrupo.opciones.map((o) => ({ modificadorOpcionId: o.id })),
  );
}

async function emitirVentas(token: string) {
  // Abrir caja
  const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
  const caja1 = cajas.body.cajas.find((c: { nombre: string }) => c.nombre === 'Caja 1');
  await request(app)
    .post(`/cajas/${caja1.id}/abrir`)
    .set('Authorization', `Bearer ${token}`)
    .send({ montoInicial: 100000 });

  const smash = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'HAM-001' } });
  const coca = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'BEB-001' } });
  const modsSmash = await modificadoresObligatoriosDe(smash.id);

  // Pedido 1: 2 Smash + 1 Coca = 70000 + 10000 = 80000
  const p1 = await request(app)
    .post('/pedidos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      tipo: 'MOSTRADOR',
      items: [
        { productoVentaId: smash.id, cantidad: 2, modificadores: modsSmash },
        { productoVentaId: coca.id, cantidad: 1 },
      ],
    });
  await request(app)
    .post(`/pedidos/${p1.body.pedido.id}/confirmar`)
    .set('Authorization', `Bearer ${token}`);
  await request(app)
    .post('/comprobantes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      pedidoId: p1.body.pedido.id,
      tipoDocumento: 'TICKET',
      pagos: [{ metodo: 'EFECTIVO', monto: 80000 }],
    });

  // Pedido 2: 1 Smash + 2 Cocas = 35000 + 20000 = 55000, pagado mixto
  const p2 = await request(app)
    .post('/pedidos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      tipo: 'MOSTRADOR',
      items: [
        { productoVentaId: smash.id, cantidad: 1, modificadores: modsSmash },
        { productoVentaId: coca.id, cantidad: 2 },
      ],
    });
  await request(app)
    .post(`/pedidos/${p2.body.pedido.id}/confirmar`)
    .set('Authorization', `Bearer ${token}`);
  await request(app)
    .post('/comprobantes')
    .set('Authorization', `Bearer ${token}`)
    .send({
      pedidoId: p2.body.pedido.id,
      tipoDocumento: 'TICKET',
      pagos: [
        { metodo: 'EFECTIVO', monto: 30000 },
        { metodo: 'BANCARD', monto: 25000 },
      ],
    });

  return { totalVentas: 80000 + 55000, totalEfectivo: 80000 + 30000, totalBancard: 25000 };
}

describe('GET /reportes/ventas/resumen', () => {
  it('cajero NO puede ver reportes → 403', async () => {
    const token = await login(CAJERO);
    const res = await request(app)
      .get('/reportes/ventas/resumen?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin obtiene totales agregados', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    const { totalVentas } = await emitirVentas(tokenCajero);

    const tokenAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/ventas/resumen?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(Number(res.body.total)).toBe(totalVentas);
    expect(res.body.cantidad).toBe(2);
    expect(Number(res.body.ticketPromedio)).toBeCloseTo(totalVentas / 2, 0);
  });
});

describe('GET /reportes/ventas/por-dia', () => {
  it('agrupa por día', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    await emitirVentas(tokenCajero);

    const tokenAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/ventas/por-dia?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.series.length).toBeGreaterThanOrEqual(1);
    expect(res.body.series[0]).toMatchObject({
      fecha: expect.any(String),
      total: expect.any(String),
      cantidad: expect.any(String),
    });
  });
});

describe('GET /reportes/productos/top', () => {
  it('rankea productos por ingreso', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    await emitirVentas(tokenCajero);

    const tokenAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/productos/top?desde=2024-01-01&hasta=2030-01-01&limite=10')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.productos.length).toBe(2);
    // Smash: 3 unidades × 35000 = 105000 (más vendido por ingreso)
    expect(res.body.productos[0].nombre).toBe('Smash Clásica');
    expect(Number(res.body.productos[0].ingreso_total)).toBe(3 * 35000);
    // Coca: 3 unidades × 10000 = 30000
    expect(res.body.productos[1].nombre).toBe('Coca-Cola 500ml');
    expect(Number(res.body.productos[1].ingreso_total)).toBe(3 * 10000);
  });
});

describe('GET /reportes/productos/rentabilidad', () => {
  // Helper local — independiente del seed legacy (HAM-001/Asunción Centro/Caja 1).
  // Toma cualquier producto activo con receta y costo positivo, abre la caja
  // del usuario, factura una unidad y devuelve sus datos para validar el reporte.
  async function emitirUnaVenta(token: string) {
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${token}`);
    type CajaResumen = { id: string; nombre: string; puntoExpedicionId: string | null };
    const caja = (cajas.body.cajas as CajaResumen[]).find((c) => c.puntoExpedicionId !== null);
    if (!caja) throw new Error('No hay caja con punto de expedición disponible');
    await request(app)
      .post(`/cajas/${caja.id}/abrir`)
      .set('Authorization', `Bearer ${token}`)
      .send({ montoInicial: 100000 });

    const producto = await prisma.productoVenta.findFirstOrThrow({
      where: { codigo: 'ACO-002', deletedAt: null, activo: true },
      select: { id: true, precioBase: true, nombre: true },
    });
    const mods = await modificadoresObligatoriosDe(producto.id);
    const pedido = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [{ productoVentaId: producto.id, cantidad: 1, modificadores: mods }],
      });
    if (!pedido.body?.pedido?.id) {
      throw new Error(`Crear pedido falló: ${JSON.stringify(pedido.body)}`);
    }
    await request(app)
      .post(`/pedidos/${pedido.body.pedido.id}/confirmar`)
      .set('Authorization', `Bearer ${token}`);
    const comprobante = await request(app)
      .post('/comprobantes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pedidoId: pedido.body.pedido.id,
        tipoDocumento: 'TICKET',
        pagos: [{ metodo: 'EFECTIVO', monto: Number(pedido.body.pedido.total) }],
      });
    if (comprobante.status !== 201) {
      throw new Error(`Emitir comprobante falló: ${JSON.stringify(comprobante.body)}`);
    }
    return {
      productoId: producto.id,
      nombre: producto.nombre,
      precio: Number(producto.precioBase),
    };
  }

  it('calcula costo, ganancia y margen sobre los snapshots del comprobante', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    const venta = await emitirUnaVenta(tokenCajero);

    const tokenAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/productos/rentabilidad?desde=2024-01-01&hasta=2030-01-01&limite=10')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.productos)).toBe(true);

    const fila = (
      res.body.productos as {
        producto_id: string | null;
        nombre: string;
        cantidad_total: string;
        ingreso_total: string;
        costo_total: string;
        ganancia_total: string;
        margen_porcentaje: number | null;
      }[]
    ).find((p) => p.producto_id === venta.productoId);
    expect(fila).toBeDefined();
    if (!fila) return;

    const ingreso = Number(fila.ingreso_total);
    const costo = Number(fila.costo_total);
    const ganancia = Number(fila.ganancia_total);

    expect(ingreso).toBe(venta.precio); // 1 unidad facturada al precio del producto
    expect(costo).toBeGreaterThan(0); // ACO-002 tiene receta con insumos de costo > 0
    expect(costo).toBeLessThan(ingreso); // margen sano
    expect(ganancia).toBe(ingreso - costo);
    expect(fila.margen_porcentaje).toBeCloseTo((100 * ganancia) / ingreso, 1);
  });

  it('cajero NO puede ver el reporte → 403', async () => {
    const token = await login(CAJERO);
    const res = await request(app)
      .get('/reportes/productos/rentabilidad?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /reportes/ventas/metodos-pago', () => {
  it('agrupa por método', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    const { totalEfectivo, totalBancard } = await emitirVentas(tokenCajero);

    const tokenAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/ventas/metodos-pago?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    const efectivo = res.body.metodos.find((m: { metodo: string }) => m.metodo === 'EFECTIVO');
    const bancard = res.body.metodos.find((m: { metodo: string }) => m.metodo === 'BANCARD');
    expect(Number(efectivo.total)).toBe(totalEfectivo);
    expect(Number(bancard.total)).toBe(totalBancard);
  });
});

describe('GET /reportes/sucursales/comparativa', () => {
  it('admin ve ambas sucursales', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    const { totalVentas } = await emitirVentas(tokenCajero);

    const tokenAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/sucursales/comparativa?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.sucursales.length).toBe(2);
    const centro = res.body.sucursales.find(
      (s: { nombre: string }) => s.nombre === 'Asunción Centro',
    );
    const slo = res.body.sucursales.find((s: { nombre: string }) => s.nombre === 'San Lorenzo');
    expect(Number(centro.total)).toBe(totalVentas);
    expect(Number(slo.total)).toBe(0); // ningún comprobante
  });
});

describe('GET /reportes/inventario/stock-bajo', () => {
  it('lista insumos con stock <= mínimo', async () => {
    await reset();
    // Forzar que un insumo quede bajo
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'PAN-001' },
    });
    const sucursal = await prisma.sucursal.findFirstOrThrow({
      where: { nombre: 'Asunción Centro' },
    });
    const stock = await prisma.stockSucursal.findUnique({
      where: {
        productoInventarioId_sucursalId: {
          productoInventarioId: insumo.id,
          sucursalId: sucursal.id,
        },
      },
    });
    await prisma.stockSucursal.update({
      where: { id: stock!.id },
      data: { stockActual: 5, stockMinimo: 20 },
    });

    const token = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/inventario/stock-bajo')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const item = res.body.alertas.find((a: { codigo: string }) => a.codigo === 'PAN-001');
    expect(item).toBeDefined();
    expect(Number(item.stock_actual)).toBe(5);
    expect(Number(item.stock_minimo)).toBe(20);
  });
});

describe('GET /reportes/inventario/valuacion', () => {
  it('suma valor total del inventario', async () => {
    const token = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/inventario/valuacion')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(Number(res.body.totalGeneral)).toBeGreaterThan(0);
  });
});

describe('GET /reportes/dashboard', () => {
  it('endpoint compuesto retorna todos los snapshots', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    await emitirVentas(tokenCajero);

    const token = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.hoy).toBeDefined();
    expect(res.body.ayer).toBeDefined();
    expect(res.body.semana).toBeDefined();
    expect(Array.isArray(res.body.ventasUltimos30)).toBe(true);
    expect(Array.isArray(res.body.topProductosSemana)).toBe(true);
    expect(Array.isArray(res.body.alertasStock)).toBe(true);
  });
});

describe('GET /reportes/ventas/por-canal', () => {
  it('agrupa ventas por tipo de pedido', async () => {
    await reset();
    const tokenCajero = await login(CAJERO);
    await emitirVentas(tokenCajero);

    const tokenAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/ventas/por-canal?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.canales)).toBe(true);
    // emitirVentas crea 2 pedidos MOSTRADOR.
    const mostrador = res.body.canales.find((c: { tipo: string }) => c.tipo === 'MOSTRADOR');
    expect(mostrador).toBeTruthy();
    expect(Number(mostrador.cantidad)).toBe(2);
  });
});

describe('GET /reportes/ventas/descuentos', () => {
  it('lista descuentos aplicados en el rango', async () => {
    await reset();
    // Setup mínimo de descuentos: motivo + límite ADMIN_EMPRESA = 100%.
    const empresa = await prisma.empresa.findFirstOrThrow();
    await prisma.codigoAutorizacionDescuento.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.motivoDescuento.deleteMany({ where: { empresaId: empresa.id, esSistema: false } });
    await prisma.limiteDescuentoRol.deleteMany({ where: { empresaId: empresa.id } });
    const motivo = await prisma.motivoDescuento.create({
      data: { empresaId: empresa.id, nombre: 'Test report descuento' },
    });
    await prisma.limiteDescuentoRol.create({
      data: { empresaId: empresa.id, rol: 'ADMIN_EMPRESA', maxPorcentaje: 100 },
    });

    const tAdmin = await login(ADMIN);
    // Abrir caja
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${tAdmin}`);
    const caja = cajas.body.cajas.find((c: { nombre: string }) => c.nombre === 'Caja 1');
    await request(app)
      .post(`/cajas/${caja.id}/abrir`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ montoInicial: 100000 });

    // Crear pedido + aplicar descuento
    const beb = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'BEB-001' } });
    const pedido = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: beb.id, cantidad: 1 }] });
    await request(app)
      .post(`/descuentos/pedidos/${pedido.body.pedido.id}/descuento`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ tipo: 'PORCENTAJE', valor: 1500, motivoDescuentoId: motivo.id });

    const res = await request(app)
      .get('/reportes/ventas/descuentos?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.descuentos)).toBe(true);
    expect(res.body.descuentos.length).toBeGreaterThan(0);
    const d = res.body.descuentos[0];
    expect(d).toHaveProperty('numero');
    expect(d.tipo).toBe('PORCENTAJE');
    expect(d.motivo).toBe('Test report descuento');

    // Filtro por motivo
    const conFiltro = await request(app)
      .get(
        `/reportes/ventas/descuentos?desde=2024-01-01&hasta=2030-01-01&motivoDescuentoId=${motivo.id}`,
      )
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(conFiltro.body.descuentos.length).toBe(1);

    // Cleanup
    await prisma.motivoDescuento.deleteMany({ where: { empresaId: empresa.id, esSistema: false } });
    await prisma.limiteDescuentoRol.deleteMany({ where: { empresaId: empresa.id } });
  });
});

describe('GET /reportes/cocina/tiempos', () => {
  it('agrega tiempos de cocina por sucursal cuando hay pedidos con timestamps completos', async () => {
    await reset();
    // Crear un pedido y forzar timestamps de timeline.
    const empresa = await prisma.empresa.findFirstOrThrow();
    const sucursal = await prisma.sucursal.findFirstOrThrow({
      where: { empresaId: empresa.id, deletedAt: null },
    });
    const ahora = new Date();
    const confirmadoEn = new Date(ahora.getTime() - 10 * 60 * 1000);
    const listoEn = new Date(ahora.getTime() - 4 * 60 * 1000);
    const entregadoEn = new Date(ahora.getTime() - 2 * 60 * 1000);

    await prisma.pedido.create({
      data: {
        empresaId: empresa.id,
        sucursalId: sucursal.id,
        numero: 9999,
        tipo: 'MOSTRADOR',
        estado: 'FACTURADO',
        confirmadoEn,
        listoEn,
        entregadoEn,
        total: 0n,
      },
    });

    const tAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/cocina/tiempos?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sucursales)).toBe(true);
    const stats = res.body.sucursales.find(
      (s: { sucursal_id: string }) => s.sucursal_id === sucursal.id,
    );
    expect(stats).toBeTruthy();
    expect(Number(stats.cantidad)).toBe(1);
    // Prep ≈ 6 min = 360 seg.
    expect(stats.prep_promedio_seg).toBeGreaterThan(355);
    expect(stats.prep_promedio_seg).toBeLessThan(365);
  });
});

describe('GET /reportes/caja/turnos', () => {
  it('lista turnos cerrados con totales de movimientos por tipo', async () => {
    await reset();
    const tCajero = await login(CAJERO);
    await emitirVentas(tCajero);

    // Traer apertura activa desde DB (más confiable que el listado de /cajas).
    const apertura = await prisma.aperturaCaja.findFirstOrThrow({
      where: { cierre: null },
      orderBy: { abiertaEn: 'desc' },
    });

    // Insertar gastos + ingresos extra al turno abierto.
    await prisma.movimientoCaja.create({
      data: {
        cajaId: apertura.cajaId,
        aperturaCajaId: apertura.id,
        tipo: 'EGRESO',
        metodoPago: 'EFECTIVO',
        monto: 15000n,
        concepto: 'Compra de hielo',
      },
    });
    await prisma.movimientoCaja.create({
      data: {
        cajaId: apertura.cajaId,
        aperturaCajaId: apertura.id,
        tipo: 'INGRESO_EXTRA',
        metodoPago: 'EFECTIVO',
        monto: 5000n,
        concepto: 'Reembolso proveedor',
      },
    });

    // Cerrar el turno via API.
    const cerrar = await request(app)
      .post(`/cajas/aperturas/${apertura.id}/cerrar`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ totalContadoEfectivo: 200000 });
    expect(cerrar.status).toBe(200);

    const tAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/caja/turnos?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.turnos)).toBe(true);
    expect(res.body.turnos.length).toBeGreaterThan(0);
    const turno = res.body.turnos[0];
    expect(Number(turno.egresos_efectivo)).toBe(15000);
    expect(Number(turno.ingresos_extra_efectivo)).toBe(5000);
    expect(turno.sucursal_nombre).toBeTruthy();
    expect(turno.usuario_nombre).toBeTruthy();
  });

  it('CSV export del reporte de caja con columnas esperadas', async () => {
    await reset();
    const tCajero = await login(CAJERO);
    await emitirVentas(tCajero);
    const apertura = await prisma.aperturaCaja.findFirstOrThrow({
      orderBy: { abiertaEn: 'desc' },
    });
    await request(app)
      .post(`/cajas/aperturas/${apertura.id}/cerrar`)
      .set('Authorization', `Bearer ${tCajero}`)
      .send({ totalContadoEfectivo: 180000 });

    const tAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/caja/turnos?desde=2024-01-01&hasta=2030-01-01&formato=csv')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Egresos / Gastos');
    expect(res.text).toContain('Diferencia');
  });
});

describe('GET /reportes/inventario/movimientos', () => {
  it('lista movimientos de stock filtrados por tipo SALIDA_MERMA', async () => {
    await reset();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const sucursal = await prisma.sucursal.findFirstOrThrow({
      where: { empresaId: empresa.id, deletedAt: null },
    });
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { empresaId: empresa.id, deletedAt: null },
    });

    // Insertamos 3 movimientos: 1 entrada compra, 1 salida venta, 1 merma.
    await prisma.movimientoStock.createMany({
      data: [
        {
          productoInventarioId: insumo.id,
          sucursalId: sucursal.id,
          tipo: 'ENTRADA_COMPRA',
          cantidad: '10',
          cantidadSigned: '10',
          costoUnitario: 1000n,
          motivo: 'Compra normal',
        },
        {
          productoInventarioId: insumo.id,
          sucursalId: sucursal.id,
          tipo: 'SALIDA_VENTA',
          cantidad: '3',
          cantidadSigned: '-3',
          costoUnitario: 1000n,
          motivo: 'Venta',
        },
        {
          productoInventarioId: insumo.id,
          sucursalId: sucursal.id,
          tipo: 'SALIDA_MERMA',
          cantidad: '2',
          cantidadSigned: '-2',
          costoUnitario: 1000n,
          motivo: 'Vencido',
        },
      ],
    });

    const tAdmin = await login(ADMIN);

    // Sin filtro: trae los 3 (al menos).
    const todos = await request(app)
      .get('/reportes/inventario/movimientos?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(todos.status).toBe(200);
    expect(todos.body.movimientos.length).toBeGreaterThanOrEqual(3);

    // Filtro por SALIDA_MERMA: solo el de merma.
    const mermas = await request(app)
      .get('/reportes/inventario/movimientos?desde=2024-01-01&hasta=2030-01-01&tipo=SALIDA_MERMA')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(mermas.status).toBe(200);
    expect(mermas.body.movimientos.length).toBe(1);
    expect(mermas.body.movimientos[0].motivo).toBe('Vencido');
    expect(Number(mermas.body.movimientos[0].cantidad_signed)).toBe(-2);
  });

  it('resumen agrega cantidades y costos por tipo', async () => {
    await reset();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const sucursal = await prisma.sucursal.findFirstOrThrow({
      where: { empresaId: empresa.id, deletedAt: null },
    });
    const insumo = await prisma.productoInventario.findFirstOrThrow({
      where: { empresaId: empresa.id, deletedAt: null },
    });

    await prisma.movimientoStock.createMany({
      data: [
        {
          productoInventarioId: insumo.id,
          sucursalId: sucursal.id,
          tipo: 'SALIDA_MERMA',
          cantidad: '5',
          cantidadSigned: '-5',
          costoUnitario: 2000n,
        },
        {
          productoInventarioId: insumo.id,
          sucursalId: sucursal.id,
          tipo: 'SALIDA_MERMA',
          cantidad: '3',
          cantidadSigned: '-3',
          costoUnitario: 2000n,
        },
      ],
    });

    const tAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/inventario/movimientos-resumen?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(res.status).toBe(200);
    const fila = res.body.tipos.find(
      (t: { tipo: string; sucursal_id: string }) =>
        t.tipo === 'SALIDA_MERMA' && t.sucursal_id === sucursal.id,
    );
    expect(fila).toBeTruthy();
    expect(Number(fila.cantidad_movimientos)).toBe(2);
    expect(Number(fila.cantidad_total)).toBe(8); // 5 + 3
    expect(Number(fila.costo_estimado)).toBe(16000); // 8 × 2000
  });
});

describe('Export CSV (?formato=csv)', () => {
  it('resumen ventas en CSV con headers correctos', async () => {
    await reset();
    const tCajero = await login(CAJERO);
    await emitirVentas(tCajero);
    const tAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/ventas/resumen?desde=2024-01-01&hasta=2030-01-01&formato=csv')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.csv');
    // BOM UTF-8 + header (U+FEFF para que Excel reconozca encoding al abrir).
    expect(res.text.startsWith('﻿')).toBe(true);
    expect(res.text).toContain('Total ventas');
    expect(res.text).toContain('Ticket promedio');
    expect(res.text).toContain('Total descuentos');
  });

  it('ventas por día en CSV con una fila por día', async () => {
    await reset();
    const tCajero = await login(CAJERO);
    await emitirVentas(tCajero);
    const tAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/ventas/por-dia?desde=2024-01-01&hasta=2030-01-01&formato=csv')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(res.status).toBe(200);
    const lineas = res.text.replace(/^\uFEFF/, '').split('\n');
    expect(lineas[0]).toContain('Fecha,Tickets,Total');
    expect(lineas.length).toBeGreaterThan(1);
  });
});

describe('GET /reportes/ventas/descuentos-por-empleado', () => {
  it('agrega cantidad y montos por empleado beneficiario', async () => {
    await reset();
    const empresa = await prisma.empresa.findFirstOrThrow();
    // Limpieza + setup: motivo del sistema "Descuento empleado" + límite admin.
    await prisma.codigoAutorizacionDescuento.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.motivoDescuento.deleteMany({ where: { empresaId: empresa.id, esSistema: false } });
    await prisma.limiteDescuentoRol.deleteMany({ where: { empresaId: empresa.id } });
    const motivo = await prisma.motivoDescuento.upsert({
      where: {
        empresaId_codigoSistema: { empresaId: empresa.id, codigoSistema: 'DESCUENTO_EMPLEADO' },
      },
      create: {
        empresaId: empresa.id,
        nombre: 'Descuento empleado',
        activo: true,
        esSistema: true,
        codigoSistema: 'DESCUENTO_EMPLEADO',
      },
      update: { activo: true },
    });
    await prisma.limiteDescuentoRol.create({
      data: { empresaId: empresa.id, rol: 'ADMIN_EMPRESA', maxPorcentaje: 100 },
    });
    await prisma.configuracionEmpresa.upsert({
      where: { empresaId: empresa.id },
      create: { empresaId: empresa.id, porcentajeDescuentoEmpleado: 50 },
      update: { porcentajeDescuentoEmpleado: 50 },
    });
    // Marcamos al gerente como beneficiario.
    const gerente = await prisma.usuario.findFirstOrThrow({
      where: { email: 'gerente.centro@smash.com.py' },
    });
    await prisma.usuario.update({
      where: { id: gerente.id },
      data: { esEmpleadoConDescuento: true },
    });

    const tAdmin = await login(ADMIN);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${tAdmin}`);
    const caja = cajas.body.cajas.find((c: { nombre: string }) => c.nombre === 'Caja 1');
    await request(app)
      .post(`/cajas/${caja.id}/abrir`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ montoInicial: 100000 });

    // Pedido con descuento empleado al gerente — Coca de Gs. 10.000 → -5.000.
    const beb = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'BEB-001' } });
    const pedido = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: beb.id, cantidad: 1 }] });
    const aplicar = await request(app)
      .post(`/descuentos/pedidos/${pedido.body.pedido.id}/descuento`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({
        tipo: 'PORCENTAJE',
        valor: 0,
        motivoDescuentoId: motivo.id,
        empleadoBeneficiarioId: gerente.id,
      });
    expect(aplicar.status).toBe(200);

    const res = await request(app)
      .get('/reportes/ventas/descuentos-por-empleado?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.empleados)).toBe(true);
    expect(res.body.empleados.length).toBe(1);

    const fila = res.body.empleados[0];
    expect(fila.empleado_id).toBe(gerente.id);
    expect(fila.cantidad_ventas).toBe('1');
    expect(fila.total_descontado).toBe('5000');
    expect(fila.base_original).toBe('10000');
    expect(fila.total_cobrado).toBe('5000');

    // Cleanup
    await prisma.usuario.update({
      where: { id: gerente.id },
      data: { esEmpleadoConDescuento: false },
    });
    await prisma.motivoDescuento.deleteMany({ where: { empresaId: empresa.id, esSistema: false } });
    await prisma.limiteDescuentoRol.deleteMany({ where: { empresaId: empresa.id } });
  });

  it('excluye pedidos CANCELADO', async () => {
    await reset();
    const empresa = await prisma.empresa.findFirstOrThrow();
    await prisma.codigoAutorizacionDescuento.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.motivoDescuento.deleteMany({ where: { empresaId: empresa.id, esSistema: false } });
    await prisma.limiteDescuentoRol.deleteMany({ where: { empresaId: empresa.id } });
    const motivo = await prisma.motivoDescuento.upsert({
      where: {
        empresaId_codigoSistema: { empresaId: empresa.id, codigoSistema: 'DESCUENTO_EMPLEADO' },
      },
      create: {
        empresaId: empresa.id,
        nombre: 'Descuento empleado',
        activo: true,
        esSistema: true,
        codigoSistema: 'DESCUENTO_EMPLEADO',
      },
      update: { activo: true },
    });
    await prisma.limiteDescuentoRol.create({
      data: { empresaId: empresa.id, rol: 'ADMIN_EMPRESA', maxPorcentaje: 100 },
    });
    const gerente = await prisma.usuario.findFirstOrThrow({
      where: { email: 'gerente.centro@smash.com.py' },
    });
    await prisma.usuario.update({
      where: { id: gerente.id },
      data: { esEmpleadoConDescuento: true },
    });

    const tAdmin = await login(ADMIN);
    const cajas = await request(app).get('/cajas').set('Authorization', `Bearer ${tAdmin}`);
    const caja = cajas.body.cajas.find((c: { nombre: string }) => c.nombre === 'Caja 1');
    await request(app)
      .post(`/cajas/${caja.id}/abrir`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ montoInicial: 100000 });

    const beb = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'BEB-001' } });
    const pedido = await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ tipo: 'MOSTRADOR', items: [{ productoVentaId: beb.id, cantidad: 1 }] });
    await request(app)
      .post(`/descuentos/pedidos/${pedido.body.pedido.id}/descuento`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({
        tipo: 'PORCENTAJE',
        valor: 0,
        motivoDescuentoId: motivo.id,
        empleadoBeneficiarioId: gerente.id,
      });

    // Cancelamos el pedido → debe desaparecer del reporte.
    await prisma.pedido.update({
      where: { id: pedido.body.pedido.id },
      data: { estado: 'CANCELADO' },
    });

    const res = await request(app)
      .get('/reportes/ventas/descuentos-por-empleado?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.empleados.length).toBe(0);

    // Cleanup
    await prisma.usuario.update({
      where: { id: gerente.id },
      data: { esEmpleadoConDescuento: false },
    });
    await prisma.motivoDescuento.deleteMany({ where: { empresaId: empresa.id, esSistema: false } });
    await prisma.limiteDescuentoRol.deleteMany({ where: { empresaId: empresa.id } });
  });

  it('exporta CSV con headers correctos', async () => {
    const tAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/ventas/descuentos-por-empleado?desde=2024-01-01&hasta=2030-01-01&formato=csv')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(res.status).toBe(200);
    const lineas = res.text.replace(/^\uFEFF/, '').split('\n');
    expect(lineas[0]).toContain('Empleado');
    expect(lineas[0]).toContain('Total descontado');
  });
});

describe('GET /reportes/ventas/promociones', () => {
  it('agrega ahorro y unidades por promoción', async () => {
    await reset();
    const empresa = await prisma.empresa.findFirstOrThrow();
    // Limpiamos promos previas
    await prisma.promocionProducto.deleteMany({ where: { promocion: { empresaId: empresa.id } } });
    await prisma.promocionSucursal.deleteMany({ where: { promocion: { empresaId: empresa.id } } });
    await prisma.promocion.deleteMany({ where: { empresaId: empresa.id } });

    // Promo PRECIO_FIJO sobre HAM-001 (35.000 → 20.000)
    const ham = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'HAM-001' } });
    const promo = await prisma.promocion.create({
      data: {
        empresaId: empresa.id,
        nombre: 'Promo reporte',
        tipo: 'PRECIO_FIJO',
        precioFijo: 20000n,
        diasSemana: [],
        productos: { create: [{ productoVentaId: ham.id }] },
      },
    });

    const tAdmin = await login(ADMIN);
    const punto = await prisma.modificadorOpcion.findFirstOrThrow({
      where: { modificadorGrupo: { nombre: 'Punto de cocción' }, nombre: 'Medio' },
    });

    // 2 pedidos con la promo, 3 unidades total → ahorro 3 * 15.000 = 45.000.
    await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [
          {
            productoVentaId: ham.id,
            cantidad: 2,
            promocionId: promo.id,
            modificadores: [{ modificadorOpcionId: punto.id }],
          },
        ],
      });
    await request(app)
      .post('/pedidos')
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({
        tipo: 'MOSTRADOR',
        items: [
          {
            productoVentaId: ham.id,
            cantidad: 1,
            promocionId: promo.id,
            modificadores: [{ modificadorOpcionId: punto.id }],
          },
        ],
      });

    const res = await request(app)
      .get('/reportes/ventas/promociones?desde=2024-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.promociones.length).toBe(1);
    const fila = res.body.promociones[0];
    expect(fila.promocion_id).toBe(promo.id);
    expect(fila.pedidos).toBe('2');
    expect(fila.unidades).toBe('3');
    // ahorro = 3 * (35000 - 20000) = 45.000
    expect(fila.ahorro_total).toBe('45000');
    // cobrado = 3 * 20000 = 60.000
    expect(fila.cobrado_total).toBe('60000');
  });

  it('exporta CSV con headers correctos', async () => {
    const tAdmin = await login(ADMIN);
    const res = await request(app)
      .get('/reportes/ventas/promociones?desde=2024-01-01&hasta=2030-01-01&formato=csv')
      .set('Authorization', `Bearer ${tAdmin}`);
    expect(res.status).toBe(200);
    const lineas = res.text.replace(/^\uFEFF/, '').split('\n');
    expect(lineas[0]).toContain('Promoción');
    expect(lineas[0]).toContain('Ahorro cliente');
  });
});

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});
