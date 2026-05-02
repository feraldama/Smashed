/**
 * Tests específicos para el endpoint PUT /catalogo/productos/:id/receta.
 * Verifica:
 *  - Reemplaza receta completa
 *  - Detección de ciclos en sub-recetas
 *  - Validación de tenant en insumos
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

const app = createApp();

const ADMIN = { email: 'admin@smash.com.py', password: 'Smash123!' };

async function login() {
  const r = await request(app).post('/auth/login').send(ADMIN);
  return r.body.accessToken as string;
}

const productosTemp: string[] = [];
async function cleanup() {
  if (productosTemp.length === 0) return;
  // Primero borrar TODOS los items que referencian a estos productos como sub-receta
  await prisma.itemReceta.deleteMany({
    where: { subProductoVentaId: { in: productosTemp } },
  });
  // Después borrar items + recetas + productos
  await prisma.itemReceta.deleteMany({
    where: { receta: { productoVentaId: { in: productosTemp } } },
  });
  await prisma.receta.deleteMany({ where: { productoVentaId: { in: productosTemp } } });
  await prisma.productoVenta.deleteMany({ where: { id: { in: productosTemp } } });
  productosTemp.length = 0;
}

describe('PUT /catalogo/productos/:id/receta', () => {
  it('reemplaza receta completa con insumos', async () => {
    const token = await login();
    const empresa = await prisma.empresa.findFirstOrThrow();

    // Crear producto sin receta
    const prod = await prisma.productoVenta.create({
      data: {
        empresaId: empresa.id,
        codigo: `RTEST-${Date.now()}`,
        nombre: 'Producto receta test',
        precioBase: 10000n,
        tasaIva: 'IVA_10',
      },
    });
    productosTemp.push(prod.id);

    const pan = await prisma.productoInventario.findFirstOrThrow({ where: { codigo: 'PAN-001' } });
    const carne = await prisma.productoInventario.findFirstOrThrow({
      where: { codigo: 'CAR-001' },
    });

    const res = await request(app)
      .put(`/catalogo/productos/${prod.id}/receta`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rinde: 1,
        items: [
          { productoInventarioId: pan.id, cantidad: 1, unidadMedida: 'UNIDAD' },
          { productoInventarioId: carne.id, cantidad: 2, unidadMedida: 'UNIDAD' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.receta.items.length).toBe(2);

    // Reemplazar con una nueva receta de 1 item
    const res2 = await request(app)
      .put(`/catalogo/productos/${prod.id}/receta`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rinde: 1,
        items: [{ productoInventarioId: pan.id, cantidad: 3, unidadMedida: 'UNIDAD' }],
      });
    expect(res2.status).toBe(200);
    expect(res2.body.receta.items.length).toBe(1);
    expect(res2.body.receta.items[0].cantidad).toBe('3');
  });

  it('detecta ciclo: A no puede tener a A como sub-receta', async () => {
    const token = await login();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const prod = await prisma.productoVenta.create({
      data: {
        empresaId: empresa.id,
        codigo: `CIC-${Date.now()}`,
        nombre: 'Ciclo test',
        precioBase: 10000n,
        tasaIva: 'IVA_10',
      },
    });
    productosTemp.push(prod.id);

    const res = await request(app)
      .put(`/catalogo/productos/${prod.id}/receta`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rinde: 1,
        items: [{ subProductoVentaId: prod.id, cantidad: 1, unidadMedida: 'UNIDAD' }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('detecta ciclo transitivo: A → B → A', async () => {
    const token = await login();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const pan = await prisma.productoInventario.findFirstOrThrow({ where: { codigo: 'PAN-001' } });

    // Producto A
    const a = await prisma.productoVenta.create({
      data: {
        empresaId: empresa.id,
        codigo: `CICA-${Date.now()}`,
        nombre: 'A',
        precioBase: 10000n,
        tasaIva: 'IVA_10',
        esPreparacion: true,
      },
    });
    productosTemp.push(a.id);

    // Producto B (sub-receta usa A)
    const b = await prisma.productoVenta.create({
      data: {
        empresaId: empresa.id,
        codigo: `CICB-${Date.now()}`,
        nombre: 'B',
        precioBase: 10000n,
        tasaIva: 'IVA_10',
        esPreparacion: true,
      },
    });
    productosTemp.push(b.id);

    // B usa A como sub-receta — válido
    const r1 = await request(app)
      .put(`/catalogo/productos/${b.id}/receta`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rinde: 1,
        items: [{ subProductoVentaId: a.id, cantidad: 1, unidadMedida: 'UNIDAD' }],
      });
    expect(r1.status).toBe(200);

    // A intenta usar a A indirectamente vía B — debería detectar ciclo
    const r2 = await request(app)
      .put(`/catalogo/productos/${a.id}/receta`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rinde: 1,
        items: [
          { productoInventarioId: pan.id, cantidad: 1, unidadMedida: 'UNIDAD' },
          { subProductoVentaId: b.id, cantidad: 1, unidadMedida: 'UNIDAD' },
        ],
      });
    expect(r2.status).toBe(400);
  });

  it('rechaza insumo de otra empresa', async () => {
    const token = await login();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const prod = await prisma.productoVenta.create({
      data: {
        empresaId: empresa.id,
        codigo: `BAD-${Date.now()}`,
        nombre: 'Bad tenant',
        precioBase: 10000n,
        tasaIva: 'IVA_10',
      },
    });
    productosTemp.push(prod.id);

    const res = await request(app)
      .put(`/catalogo/productos/${prod.id}/receta`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rinde: 1,
        items: [
          {
            productoInventarioId: 'cl000000000000000000000000',
            cantidad: 1,
            unidadMedida: 'UNIDAD',
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('item con AMBOS insumo Y subProducto → 400 (XOR)', async () => {
    const token = await login();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const prod = await prisma.productoVenta.create({
      data: {
        empresaId: empresa.id,
        codigo: `XOR-${Date.now()}`,
        nombre: 'XOR test',
        precioBase: 10000n,
        tasaIva: 'IVA_10',
      },
    });
    productosTemp.push(prod.id);

    const pan = await prisma.productoInventario.findFirstOrThrow({ where: { codigo: 'PAN-001' } });
    const subProducto = await prisma.productoVenta.findFirstOrThrow({
      where: { esPreparacion: true },
    });

    const res = await request(app)
      .put(`/catalogo/productos/${prod.id}/receta`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rinde: 1,
        items: [
          {
            productoInventarioId: pan.id,
            subProductoVentaId: subProducto.id,
            cantidad: 1,
            unidadMedida: 'UNIDAD',
          },
        ],
      });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /catalogo/productos/:id/receta', () => {
  it('elimina receta OK si no es sub-receta de otros', async () => {
    const token = await login();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const pan = await prisma.productoInventario.findFirstOrThrow({ where: { codigo: 'PAN-001' } });

    const prod = await prisma.productoVenta.create({
      data: {
        empresaId: empresa.id,
        codigo: `DEL-${Date.now()}`,
        nombre: 'Del test',
        precioBase: 10000n,
        tasaIva: 'IVA_10',
      },
    });
    productosTemp.push(prod.id);

    await request(app)
      .put(`/catalogo/productos/${prod.id}/receta`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        rinde: 1,
        items: [{ productoInventarioId: pan.id, cantidad: 1, unidadMedida: 'UNIDAD' }],
      });

    const del = await request(app)
      .delete(`/catalogo/productos/${prod.id}/receta`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const r = await prisma.receta.findUnique({ where: { productoVentaId: prod.id } });
    expect(r).toBeNull();
  });

  it('rechaza eliminar receta si el producto es sub-receta de otros → 409', async () => {
    const token = await login();
    const salsa = await prisma.productoVenta.findFirstOrThrow({
      where: { codigo: 'SUB-001' }, // Salsa de la casa
    });
    const res = await request(app)
      .delete(`/catalogo/productos/${salsa.id}/receta`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});
