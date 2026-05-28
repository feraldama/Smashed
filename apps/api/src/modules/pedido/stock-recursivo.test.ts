/**
 * Tests del expansor de recetas (BOM recursivo).
 *
 * Crea sus propias fixtures (insumos + recetas + productos) en una empresa
 * dedicada — no depende del seed. Cubre:
 *  - Receta plana con insumos en distintas unidades (UNIDAD, GRAMO/KG, ML/L).
 *  - Conversión automática entre unidades compatibles.
 *  - Falla con AppError cuando las unidades son incompatibles.
 *  - Sub-receta con `rinde > 1` y factor sub-unitario.
 *  - Producto de reventa (sin receta, vinculado a un PI).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import { expandirReceta } from './stock-recursivo.js';

const PREFIX = 'TEST_STOCKREC_';

let empresaId: string;
let insumoPan: string; // UNIDAD
let insumoLechuga: string; // KILOGRAMO
let insumoAceite: string; // LITRO
let insumoCheddar: string; // UNIDAD
let insumoMostaza: string; // MILILITRO

let prodPlato: string; // producto vendible con receta plana + sub-receta
let prodReventa: string; // producto sin receta, vinculado a PI
let prodIncompatible: string; // producto con unidad inválida (PORCION vs UNIDAD)

async function cleanup() {
  // Borrar en orden: stock, movimientos, items de receta, recetas, productos, insumos.
  // Filtramos por nombre/codigo que arranca con PREFIX para no tocar nada del seed.
  await prisma.movimientoStock.deleteMany({
    where: { motivo: { contains: PREFIX } },
  });
  await prisma.stockSucursal.deleteMany({
    where: { producto: { codigo: { startsWith: PREFIX } } },
  });
  await prisma.itemReceta.deleteMany({
    where: { receta: { productoVenta: { nombre: { startsWith: PREFIX } } } },
  });
  await prisma.receta.deleteMany({
    where: { productoVenta: { nombre: { startsWith: PREFIX } } },
  });
  await prisma.productoVenta.deleteMany({
    where: { nombre: { startsWith: PREFIX } },
  });
  await prisma.productoInventario.deleteMany({
    where: { codigo: { startsWith: PREFIX } },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  const empresa = await prisma.empresa.findFirstOrThrow({ where: { deletedAt: null } });
  empresaId = empresa.id;
  await cleanup();

  const mk = async (codigo: string, nombre: string, unidad: 'UNIDAD' | 'KILOGRAMO' | 'LITRO') => {
    const pi = await prisma.productoInventario.create({
      data: {
        empresaId,
        codigo: PREFIX + codigo,
        nombre,
        unidadMedida: unidad,
        costoUnitario: 0,
      },
      select: { id: true },
    });
    return pi.id;
  };

  insumoPan = await mk('PAN', 'Pan TEST', 'UNIDAD');
  insumoLechuga = await mk('LCH', 'Lechuga TEST', 'KILOGRAMO');
  insumoAceite = await mk('ACE', 'Aceite TEST', 'LITRO');
  insumoCheddar = await mk('CHE', 'Cheddar TEST', 'UNIDAD');
  insumoMostaza = await mk('MOS', 'Mostaza TEST', 'MILILITRO' as never);
  // MILILITRO no está en el tipo del helper — lo cargamos vía update directo
  await prisma.productoInventario.update({
    where: { id: insumoMostaza },
    data: { unidadMedida: 'MILILITRO' },
  });

  // Sub-receta: "Salsa TEST" rinde 100 ML, lleva 60 ML de mostaza y 40 ML de aceite.
  // (Aceite cargado en LITRO → debe convertir 40 ML a 0.040 L.)
  const salsa = await prisma.productoVenta.create({
    data: {
      empresaId,
      nombre: PREFIX + 'SALSA',
      precioBase: 0n,
      esVendible: false,
      esPreparacion: true,
      receta: {
        create: {
          empresaId,
          rinde: 100,
          unidadRinde: 'MILILITRO',
          items: {
            create: [
              {
                productoInventarioId: insumoMostaza,
                cantidad: 60,
                unidadMedida: 'MILILITRO',
              },
              {
                productoInventarioId: insumoAceite,
                cantidad: 40,
                unidadMedida: 'MILILITRO',
              },
            ],
          },
        },
      },
    },
    select: { id: true },
  });

  // Producto plato: 1 pan (UNIDAD), 30 g de lechuga (KG en PI), 1 cheddar (UNIDAD),
  // + 30 ML de salsa (sub-receta rinde 100 ML).
  const plato = await prisma.productoVenta.create({
    data: {
      empresaId,
      nombre: PREFIX + 'PLATO',
      precioBase: 0n,
      esVendible: true,
      receta: {
        create: {
          empresaId,
          rinde: 1,
          unidadRinde: 'UNIDAD',
          items: {
            create: [
              {
                productoInventarioId: insumoPan,
                cantidad: 1,
                unidadMedida: 'UNIDAD',
              },
              {
                productoInventarioId: insumoLechuga,
                cantidad: 30,
                unidadMedida: 'GRAMO',
              },
              {
                productoInventarioId: insumoCheddar,
                cantidad: 1,
                unidadMedida: 'UNIDAD',
              },
              {
                subProductoVentaId: salsa.id,
                cantidad: 30,
                unidadMedida: 'MILILITRO',
              },
            ],
          },
        },
      },
    },
    select: { id: true },
  });
  prodPlato = plato.id;

  // Producto reventa: sin receta, vinculado a un PI con cantidadInventario.
  const reventa = await prisma.productoVenta.create({
    data: {
      empresaId,
      nombre: PREFIX + 'REVENTA',
      precioBase: 0n,
      esVendible: true,
      productoInventarioId: insumoCheddar,
      cantidadInventario: 1,
    },
    select: { id: true },
  });
  prodReventa = reventa.id;

  // Producto con receta inválida (item en PORCION, PI en UNIDAD → incompatible).
  const malo = await prisma.productoVenta.create({
    data: {
      empresaId,
      nombre: PREFIX + 'INCOMPATIBLE',
      precioBase: 0n,
      esVendible: true,
      receta: {
        create: {
          empresaId,
          rinde: 1,
          unidadRinde: 'UNIDAD',
          items: {
            create: {
              productoInventarioId: insumoPan,
              cantidad: 1,
              unidadMedida: 'PORCION',
            },
          },
        },
      },
    },
    select: { id: true },
  });
  prodIncompatible = malo.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('expandirReceta — conversión de unidades', () => {
  it('convierte GRAMO → KILOGRAMO y MILILITRO → LITRO automáticamente', async () => {
    const consumo = await expandirReceta(prisma, prodPlato, 1);

    expect(consumo.get(insumoPan)).toBe(1); // 1 UNIDAD
    expect(consumo.get(insumoCheddar)).toBe(1); // 1 UNIDAD
    // Lechuga: 30 GRAMO → 0.030 KG (unidad del PI)
    expect(consumo.get(insumoLechuga)).toBeCloseTo(0.03, 6);
    // Sub-receta salsa: factor = 30/100 = 0.3.
    //   mostaza: 60 ML × 0.3 = 18 ML (PI también en ML → sin conversión)
    //   aceite:  40 ML × 0.3 = 12 ML → 0.012 L (PI en LITRO)
    expect(consumo.get(insumoMostaza)).toBeCloseTo(18, 6);
    expect(consumo.get(insumoAceite)).toBeCloseTo(0.012, 6);
  });

  it('× N escala linealmente sin acumular error de unidades', async () => {
    const c = await expandirReceta(prisma, prodPlato, 3);
    expect(c.get(insumoPan)).toBe(3);
    expect(c.get(insumoLechuga)).toBeCloseTo(0.09, 6); // 30g × 3 = 90g = 0.09 kg
    expect(c.get(insumoAceite)).toBeCloseTo(0.036, 6); // 0.012 × 3
  });

  it('reventa: usa cantidadInventario del PI directo', async () => {
    const c = await expandirReceta(prisma, prodReventa, 5);
    expect(c.size).toBe(1);
    expect(c.get(insumoCheddar)).toBe(5);
  });

  it('producto sin receta ni reventa → consumo vacío', async () => {
    const c = await expandirReceta(prisma, 'cl000000000000000000000000', 1);
    expect(c.size).toBe(0);
  });

  it('tira AppError(VALIDATION_ERROR) cuando las unidades del item son incompatibles con el PI', async () => {
    await expect(expandirReceta(prisma, prodIncompatible, 1)).rejects.toMatchObject({
      name: 'AppError',
      code: 'VALIDATION_ERROR',
    });
    try {
      await expandirReceta(prisma, prodIncompatible, 1);
      expect.fail('debería haber tirado');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).message).toContain('PORCION');
      expect((e as AppError).message).toContain('UNIDAD');
    }
  });
});
