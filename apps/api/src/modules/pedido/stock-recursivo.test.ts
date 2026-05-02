/**
 * Tests del expansor de recetas (BOM recursivo).
 * Usa el seed real:
 *  - Smash Clásica usa Salsa de la casa (sub-receta)
 *  - Salsa de la casa rinde 100ml = 60ml mayonesa + 25ml mostaza + 15ml ketchup
 *  - Smash Clásica consume 30ml de salsa por unidad
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/prisma.js';

import { expandirReceta } from './stock-recursivo.js';

describe('expandirReceta — BOM recursivo', () => {
  it('Smash Clásica × 1 → expande receta directa + sub-receta de Salsa', async () => {
    const smash = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'HAM-001' } });
    const consumo = await expandirReceta(prisma, smash.id, 1);

    // Convertimos a un map por código para legibilidad
    const insumos = await prisma.productoInventario.findMany({
      where: { id: { in: [...consumo.keys()] } },
      select: { id: true, codigo: true, nombre: true },
    });
    const byCodigo = new Map<string, number>();
    for (const ins of insumos) byCodigo.set(ins.codigo!, consumo.get(ins.id)!);

    // Insumos directos de Smash Clásica
    expect(byCodigo.get('PAN-001')).toBe(1); // 1 pan
    expect(byCodigo.get('CAR-001')).toBe(1); // 1 medallón
    expect(byCodigo.get('LAC-001')).toBe(1); // 1 cheddar
    expect(byCodigo.get('VEG-001')).toBe(30); // 30g lechuga
    expect(byCodigo.get('VEG-002')).toBe(0.5); // medio tomate
    expect(byCodigo.get('VEG-003')).toBe(0.25); // cuarto cebolla

    // Sub-receta: Salsa de la casa rinde 100ml; usa 30ml en Smash → factor 0.3
    // → mayonesa 60 * 0.3 = 18, mostaza 25 * 0.3 = 7.5, ketchup 15 * 0.3 = 4.5
    expect(byCodigo.get('SAL-001')).toBeCloseTo(18, 5); // mayonesa
    expect(byCodigo.get('SAL-002')).toBeCloseTo(7.5, 5); // mostaza
    expect(byCodigo.get('SAL-003')).toBeCloseTo(4.5, 5); // ketchup
  });

  it('Smash Clásica × 3 → todas las cantidades multiplicadas por 3', async () => {
    const smash = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'HAM-001' } });
    const consumo3 = await expandirReceta(prisma, smash.id, 3);

    const insumos = await prisma.productoInventario.findMany({
      where: { id: { in: [...consumo3.keys()] } },
      select: { id: true, codigo: true },
    });
    const byCodigo = new Map<string, number>();
    for (const ins of insumos) byCodigo.set(ins.codigo!, consumo3.get(ins.id)!);

    expect(byCodigo.get('PAN-001')).toBe(3);
    expect(byCodigo.get('CAR-001')).toBe(3);
    expect(byCodigo.get('SAL-001')).toBeCloseTo(54, 5); // 18 × 3
    expect(byCodigo.get('SAL-002')).toBeCloseTo(22.5, 5); // 7.5 × 3
  });

  it('producto sin receta → consumo vacío', async () => {
    // Las bebidas en el seed sí tienen receta directa (1 insumo = 1 producto).
    // Para testear sin receta, usamos una sub-preparación sin items adicionales:
    // todas las recetas del seed tienen items, así que verificamos un id inventado.
    const consumo = await expandirReceta(prisma, 'cl000000000000000000000000', 1);
    expect(consumo.size).toBe(0);
  });

  it('Coca-Cola × 5 → 5 unidades del insumo BEB-001 directamente', async () => {
    const coca = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'BEB-001' } });
    const consumo = await expandirReceta(prisma, coca.id, 5);
    expect(consumo.size).toBe(1); // un solo insumo
    const insumo = await prisma.productoInventario.findFirst({ where: { codigo: 'BEB-001' } });
    expect(consumo.get(insumo!.id)).toBe(5);
  });

  it('Doble Smash × 2 → consume 4 medallones + 4 fetas + ...', async () => {
    const doble = await prisma.productoVenta.findFirstOrThrow({ where: { codigo: 'HAM-002' } });
    const consumo = await expandirReceta(prisma, doble.id, 2);

    const insumos = await prisma.productoInventario.findMany({
      where: { id: { in: [...consumo.keys()] } },
      select: { id: true, codigo: true },
    });
    const byCodigo = new Map<string, number>();
    for (const ins of insumos) byCodigo.set(ins.codigo!, consumo.get(ins.id)!);

    // Doble Smash usa 2 medallones por unidad → × 2 unidades = 4
    expect(byCodigo.get('CAR-001')).toBe(4);
    expect(byCodigo.get('LAC-001')).toBe(4); // 2 fetas × 2 unidades
    expect(byCodigo.get('PAN-001')).toBe(2); // 1 pan × 2 unidades
  });
});

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});
