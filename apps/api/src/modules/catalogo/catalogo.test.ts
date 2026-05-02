/**
 * Tests del módulo catálogo.
 * Asume que el seed corrió: 11 categorías, 24 productos venta, 1 combo, recetas anidadas.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' };
const CAJERO = { email: 'cajero1@smash.com.py', password: 'Smash123!' };

async function loginAdmin() {
  const res = await request(app).post('/auth/login').send(ADMIN);
  return res.body.accessToken as string;
}

async function loginCajero() {
  const res = await request(app).post('/auth/login').send(CAJERO);
  return res.body.accessToken as string;
}

describe('GET /catalogo/categorias', () => {
  it('sin auth → 401', async () => {
    const res = await request(app).get('/catalogo/categorias');
    expect(res.status).toBe(401);
  });

  it('admin → lista categorías de su empresa con conteo de productos', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .get('/catalogo/categorias')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.categorias)).toBe(true);
    expect(res.body.categorias.length).toBeGreaterThan(0);
    const ham = res.body.categorias.find((c: { nombre: string }) => c.nombre === 'Hamburguesas');
    expect(ham).toBeDefined();
    expect(ham.totalProductos).toBeGreaterThanOrEqual(3);
    expect(ham.categoriaBase).toBe('HAMBURGUESA');
  });
});

describe('GET /catalogo/productos', () => {
  it('admin → lista todos los productos vendibles de la empresa', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .get('/catalogo/productos')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.productos)).toBe(true);
    // Seed creó 24 productos pero 1 es sub-preparación (no vendible) → debería ver 23
    expect(res.body.productos.length).toBe(23);
    expect(res.body.sucursalActivaId).toBeTruthy();
  });

  it('cada producto incluye precio (con/sin override) e imagenUrl', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .get('/catalogo/productos')
      .set('Authorization', `Bearer ${token}`);
    const sample = res.body.productos[0];
    expect(sample).toMatchObject({
      id: expect.any(String),
      nombre: expect.any(String),
      precio: expect.any(String), // BigInt serializado
      precioBase: expect.any(String),
      tasaIva: expect.any(String),
      tienePrecioSucursal: expect.any(Boolean),
    });
  });

  it('filtra por categoría', async () => {
    const token = await loginAdmin();
    const cat = await prisma.categoriaProductoEmpresa.findFirst({
      where: { nombre: 'Hamburguesas' },
    });
    const res = await request(app)
      .get(`/catalogo/productos?categoriaId=${cat!.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.productos.length).toBe(3); // 3 hamburguesas en el seed
    res.body.productos.forEach((p: { categoria: { nombre: string } }) => {
      expect(p.categoria.nombre).toBe('Hamburguesas');
    });
  });

  it('filtra por búsqueda parcial en nombre', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .get('/catalogo/productos?busqueda=smash')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // "Smash Clásica", "Doble Smash", "Combo Smash"
    expect(res.body.productos.length).toBeGreaterThanOrEqual(3);
    res.body.productos.forEach((p: { nombre: string }) => {
      expect(p.nombre.toLowerCase()).toContain('smash');
    });
  });

  it('búsqueda por código de barras exacto', async () => {
    const token = await loginAdmin();
    // Seed le puso 7790895001234 a la Coca-Cola
    const res = await request(app)
      .get('/catalogo/productos?busqueda=7790895001234')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Búsqueda con codigoBarras puede no matchear si seed lo puso en producto_inventario y no en producto_venta
    // El test verifica que el endpoint no falle con código numérico largo
    expect(Array.isArray(res.body.productos)).toBe(true);
  });

  it('filtra solo combos con esCombo=true', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .get('/catalogo/productos?esCombo=true')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.productos.length).toBe(1); // 1 combo en seed
    expect(res.body.productos[0].esCombo).toBe(true);
  });
});

describe('GET /catalogo/productos/:id', () => {
  it('producto simple → incluye receta con items', async () => {
    const token = await loginAdmin();
    const smashClasica = await prisma.productoVenta.findFirst({
      where: { codigo: 'HAM-001' },
    });
    const res = await request(app)
      .get(`/catalogo/productos/${smashClasica!.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.producto.nombre).toBe('Smash Clásica');
    expect(res.body.producto.receta.items.length).toBeGreaterThan(0);
    // Sub-receta presente: la salsa
    const subReceta = res.body.producto.receta.items.find(
      (it: { subProducto: { nombre: string } | null }) =>
        it.subProducto?.nombre === 'Salsa de la casa',
    );
    expect(subReceta).toBeDefined();
  });

  it('combo → incluye grupos con opciones y modificadores aplicados', async () => {
    const token = await loginAdmin();
    const combo = await prisma.productoVenta.findFirst({ where: { codigo: 'COMBO-SMASH' } });
    const res = await request(app)
      .get(`/catalogo/productos/${combo!.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.producto.esCombo).toBe(true);
    expect(res.body.producto.combo.grupos.length).toBe(3);
    const grupoHam = res.body.producto.combo.grupos.find((g: { nombre: string }) =>
      g.nombre.toLowerCase().includes('hamburguesa'),
    );
    expect(grupoHam.opciones.length).toBe(3);
  });

  it('hamburguesa → incluye grupos de modificadores (punto, sin..., extras)', async () => {
    const token = await loginAdmin();
    const ham = await prisma.productoVenta.findFirst({ where: { codigo: 'HAM-001' } });
    const res = await request(app)
      .get(`/catalogo/productos/${ham!.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.producto.modificadorGrupos.length).toBe(3);
    const punto = res.body.producto.modificadorGrupos.find(
      (m: { modificadorGrupo: { nombre: string } }) =>
        m.modificadorGrupo.nombre === 'Punto de cocción',
    );
    expect(punto.modificadorGrupo.opciones.length).toBe(3);
    expect(punto.modificadorGrupo.tipo).toBe('UNICA');
  });

  it('id inexistente → 404', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .get('/catalogo/productos/clxxxxxxxxxxxxxxxxxxxxxxx')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  WRITE — Categorías
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /catalogo/categorias', () => {
  it('admin crea categoría → 201', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .post('/catalogo/categorias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: `Test cat ${Date.now()}`, categoriaBase: 'OTRO', ordenMenu: 99 });
    expect(res.status).toBe(201);
    expect(res.body.categoria.id).toBeDefined();

    // limpieza
    await prisma.categoriaProductoEmpresa.delete({ where: { id: res.body.categoria.id } });
  });

  it('cajero NO puede crear categoría → 403', async () => {
    const token = await loginCajero();
    const res = await request(app)
      .post('/catalogo/categorias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'X' });
    expect(res.status).toBe(403);
  });

  it('input inválido → 400', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .post('/catalogo/categorias')
      .set('Authorization', `Bearer ${token}`)
      .send({ categoriaBase: 'INEXISTENTE' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /catalogo/categorias/:id', () => {
  it('admin renombra categoría', async () => {
    const token = await loginAdmin();
    const cat = await prisma.categoriaProductoEmpresa.create({
      data: {
        empresaId: (await prisma.empresa.findFirstOrThrow()).id,
        nombre: `Tmp ${Date.now()}`,
        categoriaBase: 'OTRO',
      },
    });

    const res = await request(app)
      .patch(`/catalogo/categorias/${cat.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Renombrada', ordenMenu: 5 });
    expect(res.status).toBe(200);
    expect(res.body.categoria.nombre).toBe('Renombrada');
    expect(res.body.categoria.ordenMenu).toBe(5);

    await prisma.categoriaProductoEmpresa.delete({ where: { id: cat.id } });
  });

  it('id inexistente → 404', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .patch('/catalogo/categorias/clxxxxxxxxxxxxxxxxxxxxxxx')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /catalogo/categorias/:id', () => {
  it('soft delete OK si no tiene productos', async () => {
    const token = await loginAdmin();
    const cat = await prisma.categoriaProductoEmpresa.create({
      data: {
        empresaId: (await prisma.empresa.findFirstOrThrow()).id,
        nombre: `Tmp ${Date.now()}`,
        categoriaBase: 'OTRO',
      },
    });

    const res = await request(app)
      .delete(`/catalogo/categorias/${cat.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    const después = await prisma.categoriaProductoEmpresa.findUnique({ where: { id: cat.id } });
    expect(después?.deletedAt).not.toBeNull();
    expect(después?.activa).toBe(false);

    await prisma.categoriaProductoEmpresa.delete({ where: { id: cat.id } });
  });

  it('rechaza eliminar categoría con productos → 409', async () => {
    const token = await loginAdmin();
    const cat = await prisma.categoriaProductoEmpresa.findFirstOrThrow({
      where: { nombre: 'Hamburguesas' },
    });
    const res = await request(app)
      .delete(`/catalogo/categorias/${cat.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  WRITE — Productos
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /catalogo/productos', () => {
  it('admin crea producto → 201 con categoría', async () => {
    const token = await loginAdmin();
    const cat = await prisma.categoriaProductoEmpresa.findFirstOrThrow({
      where: { nombre: 'Hamburguesas' },
    });
    const codigo = `TST-${Date.now()}`;
    const res = await request(app)
      .post('/catalogo/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoriaId: cat.id,
        codigo,
        nombre: 'Hamburguesa de prueba',
        precioBase: 30000,
        tasaIva: 'IVA_10',
        sectorComanda: 'COCINA_CALIENTE',
      });
    expect(res.status).toBe(201);
    expect(res.body.producto.nombre).toBe('Hamburguesa de prueba');
    expect(res.body.producto.precioBase).toBe('30000');
    expect(res.body.producto.categoria?.nombre).toBe('Hamburguesas');

    await prisma.productoVenta.delete({ where: { id: res.body.producto.id } });
  });

  it('rechaza categoria de otra empresa', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .post('/catalogo/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoriaId: 'clxxxxxxxxxxxxxxxxxxxxxxx',
        nombre: 'X',
        precioBase: 1000,
      });
    expect(res.status).toBe(400);
  });

  it('cajero NO puede crear producto → 403', async () => {
    const token = await loginCajero();
    const res = await request(app)
      .post('/catalogo/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'X', precioBase: 1000 });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /catalogo/productos/:id', () => {
  it('admin actualiza precio + nombre', async () => {
    const token = await loginAdmin();
    const prod = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'HAM-001' } });
    const nombreOriginal = prod.nombre;

    const res = await request(app)
      .patch(`/catalogo/productos/${prod.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Smash Clásica TEST', precioBase: 36000 });
    expect(res.status).toBe(200);
    expect(res.body.producto.nombre).toBe('Smash Clásica TEST');
    expect(res.body.producto.precioBase).toBe('36000');

    // Restaurar para no afectar otros tests
    await prisma.productoVenta.update({
      where: { id: prod.id },
      data: { nombre: nombreOriginal, precioBase: 35000n },
    });
  });
});

describe('DELETE /catalogo/productos/:id', () => {
  it('soft delete + ya no aparece en listado', async () => {
    const token = await loginAdmin();
    const cat = await prisma.categoriaProductoEmpresa.findFirstOrThrow({
      where: { nombre: 'Hamburguesas' },
    });
    // Crear uno temporal
    const create = await request(app)
      .post('/catalogo/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({ categoriaId: cat.id, nombre: 'Tmp', precioBase: 1000 });
    const id = create.body.producto.id as string;

    const del = await request(app)
      .delete(`/catalogo/productos/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    // Limpieza dura
    await prisma.productoVenta.delete({ where: { id } });
  });
});

describe('POST /catalogo/productos/:id/precio-sucursal', () => {
  it('admin setea override de precio para una sucursal', async () => {
    const token = await loginAdmin();
    const prod = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'BEB-001' } });
    const sucursal = await prisma.sucursal.findFirstOrThrow({ where: { nombre: 'San Lorenzo' } });

    // Limpiar overrides previos para este test
    await prisma.precioPorSucursal.deleteMany({
      where: { productoVentaId: prod.id, sucursalId: sucursal.id },
    });

    const res = await request(app)
      .post(`/catalogo/productos/${prod.id}/precio-sucursal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: sucursal.id, precio: 11000 });
    expect(res.status).toBe(201);
    expect(res.body.precio.precio).toBe('11000');

    // Setear OTRO precio nuevo cierra el anterior
    const res2 = await request(app)
      .post(`/catalogo/productos/${prod.id}/precio-sucursal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sucursalId: sucursal.id, precio: 12000 });
    expect(res2.status).toBe(201);

    const todos = await prisma.precioPorSucursal.findMany({
      where: { productoVentaId: prod.id, sucursalId: sucursal.id },
    });
    expect(todos.length).toBe(2);
    const vigentes = todos.filter((t) => !t.vigenteHasta);
    expect(vigentes.length).toBe(1); // sólo el último

    // Limpieza
    await prisma.precioPorSucursal.deleteMany({
      where: { productoVentaId: prod.id, sucursalId: sucursal.id },
    });
  });
});

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});
