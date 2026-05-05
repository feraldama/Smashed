/**
 * Tests unitarios del schema Zod de pedidos. No tocan BD ni HTTP — sólo
 * validan que el `superRefine` rechace combinaciones tipo/campos
 * inconsistentes y acepte las válidas.
 */
import { describe, expect, it } from 'vitest';

import { crearPedidoInput } from './pedido.schemas.js';

const cuid = (n: number) => `cl${String(n).padStart(23, '0')}`;
const itemBase = { productoVentaId: cuid(1), cantidad: 1 };

describe('crearPedidoInput superRefine', () => {
  it('MOSTRADOR sin nada extra es válido', () => {
    const r = crearPedidoInput.safeParse({ tipo: 'MOSTRADOR', items: [itemBase] });
    expect(r.success).toBe(true);
  });

  it('MOSTRADOR con direccionEntregaId es rechazado', () => {
    const r = crearPedidoInput.safeParse({
      tipo: 'MOSTRADOR',
      direccionEntregaId: cuid(2),
      clienteId: cuid(3),
      items: [itemBase],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.direccionEntregaId).toBeDefined();
    }
  });

  it('MESA sin mesaId es rechazado', () => {
    const r = crearPedidoInput.safeParse({ tipo: 'MESA', items: [itemBase] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.mesaId).toBeDefined();
    }
  });

  it('MESA con mesaId es válido', () => {
    const r = crearPedidoInput.safeParse({
      tipo: 'MESA',
      mesaId: cuid(4),
      items: [itemBase],
    });
    expect(r.success).toBe(true);
  });

  it('MESA con direccionEntregaId es rechazado', () => {
    const r = crearPedidoInput.safeParse({
      tipo: 'MESA',
      mesaId: cuid(4),
      clienteId: cuid(3),
      direccionEntregaId: cuid(5),
      items: [itemBase],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.direccionEntregaId).toBeDefined();
    }
  });

  it('DELIVERY_PROPIO sin cliente ni dirección es válido (toma rápida; se completa al despacho)', () => {
    const r = crearPedidoInput.safeParse({
      tipo: 'DELIVERY_PROPIO',
      items: [itemBase],
    });
    expect(r.success).toBe(true);
  });

  it('DELIVERY_PROPIO con cliente solo (sin dirección) es válido', () => {
    const r = crearPedidoInput.safeParse({
      tipo: 'DELIVERY_PROPIO',
      clienteId: cuid(3),
      items: [itemBase],
    });
    expect(r.success).toBe(true);
  });

  it('DELIVERY_PROPIO con cliente y dirección es válido', () => {
    const r = crearPedidoInput.safeParse({
      tipo: 'DELIVERY_PROPIO',
      clienteId: cuid(3),
      direccionEntregaId: cuid(2),
      items: [itemBase],
    });
    expect(r.success).toBe(true);
  });

  it('DELIVERY_PEDIDOSYA con cliente y dirección es válido', () => {
    const r = crearPedidoInput.safeParse({
      tipo: 'DELIVERY_PEDIDOSYA',
      clienteId: cuid(3),
      direccionEntregaId: cuid(2),
      items: [itemBase],
    });
    expect(r.success).toBe(true);
  });

  it('direccionEntregaId sin clienteId es rechazado (no podemos validar pertenencia)', () => {
    const r = crearPedidoInput.safeParse({
      tipo: 'DELIVERY_PROPIO',
      direccionEntregaId: cuid(2),
      items: [itemBase],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      // Falla la regla cross-field: si hay dirección, también debe haber cliente.
      expect(r.error.flatten().fieldErrors.clienteId).toBeDefined();
    }
  });

  it('RETIRO_LOCAL con direccionEntregaId es rechazado', () => {
    const r = crearPedidoInput.safeParse({
      tipo: 'RETIRO_LOCAL',
      clienteId: cuid(3),
      direccionEntregaId: cuid(2),
      items: [itemBase],
    });
    expect(r.success).toBe(false);
  });
});
