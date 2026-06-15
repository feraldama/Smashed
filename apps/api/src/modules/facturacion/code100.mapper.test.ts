import { describe, expect, it } from 'vitest';

import {
  type ComprobanteCode100Input,
  type ItemCode100Input,
  mapearComprobanteACode100,
} from './code100.mapper.js';

import type { TasaIva } from '@prisma/client';

function item(over: Partial<ItemCode100Input> = {}): ItemCode100Input {
  const cantidad = over.cantidad ?? 1;
  const precio = over.precioUnitario ?? 110_000n;
  const desc = over.descuentoUnitario ?? 0n;
  return {
    codigo: over.codigo ?? '1',
    descripcion: over.descripcion ?? 'Prueba',
    cantidad,
    precioUnitario: precio,
    descuentoUnitario: desc,
    tasaIva: over.tasaIva ?? 'IVA_10',
    subtotal: over.subtotal ?? (precio - desc) * BigInt(cantidad),
  };
}

function comprobante(over: Partial<ComprobanteCode100Input> = {}): ComprobanteCode100Input {
  const items = over.items ?? [item()];
  const totalDescuento = over.totalDescuento ?? 0n;
  const recargoDelivery = over.recargoDelivery ?? 0n;
  // Por defecto el total reconcilia con los ítems (suma neta - descuento + recargo).
  const sumItems = items.reduce((acc, it) => acc + it.subtotal, 0n);
  const total = over.total ?? sumItems - totalDescuento + recargoDelivery;
  return {
    tipoDocumento: 'FACTURA',
    establecimiento: '001',
    puntoExpedicionCodigo: '001',
    numero: 1,
    fechaEmision: new Date('2026-06-15T13:55:02Z'), // 10:55:02 en Asunción (UTC-3)
    condicionVenta: 'CONTADO',
    receptorTipoContribuyente: 'CONSUMIDOR_FINAL',
    receptorRuc: null,
    receptorDv: null,
    receptorDocumento: null,
    receptorRazonSocial: 'Consumidor Final',
    receptorEmail: null,
    receptorDireccion: null,
    pagos: [{ metodo: 'EFECTIVO', monto: total }],
    ...over,
    items,
    totalDescuento,
    recargoDelivery,
    total,
  };
}

/** Suma de dTotOpeItem de todas las líneas del DE (lo que debe reconciliar). */
function sumaDetalles(detalles: { dTotOpeItem: string }[]): bigint {
  return detalles.reduce((acc, d) => acc + BigInt(d.dTotOpeItem), 0n);
}

describe('mapearComprobanteACode100 — cabecera y numeración', () => {
  it('arma la cabecera con padding y fecha local de Paraguay', () => {
    const p = mapearComprobanteACode100(
      comprobante({ establecimiento: '1', puntoExpedicionCodigo: '2', numero: 41 }),
    );
    expect(p.tipOpe).toBe('1');
    expect(p.iTiDE).toBe('1');
    expect(p.dEst).toBe('001');
    expect(p.dPunExp).toBe('002');
    expect(p.dNumDoc).toBe('0000041');
    expect(p.dFeEmiDE).toBe('2026-06-15T10:55:02');
    expect(p.cMoneOpe).toBe('PYG');
    expect(p.iTImp).toBe('1');
    expect(p.iCondOpe).toBe('1');
  });

  it('rechaza tickets (no fiscales)', () => {
    expect(() => mapearComprobanteACode100(comprobante({ tipoDocumento: 'TICKET' }))).toThrow();
  });

  it('rechaza autofactura y nota de remisión (estructura no soportada aún)', () => {
    expect(() => mapearComprobanteACode100(comprobante({ tipoDocumento: 'AUTOFACTURA' }))).toThrow(
      /Autofactura/,
    );
    expect(() =>
      mapearComprobanteACode100(comprobante({ tipoDocumento: 'NOTA_REMISION' })),
    ).toThrow(/remisión/);
  });
});

describe('receptor', () => {
  it('consumidor final → innominado (iTipIDRec=5, dNumIDRec=0, Sin Nombre)', () => {
    const p = mapearComprobanteACode100(comprobante());
    expect(p.iNatRec).toBe('2');
    expect(p.iTiOpe).toBe('2');
    expect(p.iTipIDRec).toBe('5');
    expect(p.dNumIDRec).toBe('0');
    expect(p.dNomRec).toBe('Sin Nombre');
    expect(p.cPaisRec).toBe('PRY');
    expect(p.dRucRec).toBeUndefined();
  });

  it('contribuyente persona jurídica con RUC → B2B', () => {
    const p = mapearComprobanteACode100(
      comprobante({
        receptorTipoContribuyente: 'PERSONA_JURIDICA',
        receptorRuc: '12345678',
        receptorDv: '9',
        receptorRazonSocial: 'Prueba S.A.',
      }),
    );
    expect(p.iNatRec).toBe('1');
    expect(p.iTiOpe).toBe('1');
    expect(p.iTiContRec).toBe('2');
    expect(p.dRucRec).toBe('12345678');
    expect(p.dDVRec).toBe('9');
    expect(p.dNomRec).toBe('Prueba S.A.');
    expect(p.iTipIDRec).toBeUndefined();
  });

  it('persona física con CI (sin RUC) → no contribuyente nominado', () => {
    const p = mapearComprobanteACode100(
      comprobante({
        receptorTipoContribuyente: 'PERSONA_FISICA',
        receptorDocumento: '4567890',
        receptorRazonSocial: 'Juan Pérez',
      }),
    );
    expect(p.iNatRec).toBe('2');
    expect(p.iTipIDRec).toBe('1');
    expect(p.dNumIDRec).toBe('4567890');
    expect(p.dNomRec).toBe('Juan Pérez');
  });
});

describe('detalles e IVA por ítem (golden vs ejemplo NC del proveedor)', () => {
  // Ejemplo real: ítem de 110.000 Gs IVA 10% → base 100.000, IVA 10.000.
  it('liquida IVA 10% incluido con redondeo correcto', () => {
    const p = mapearComprobanteACode100(
      comprobante({ items: [item({ precioUnitario: 110_000n })] }),
    );
    const d = p.Detalles[0]!;
    expect(d.dPUniProSer).toBe('110000');
    expect(d.dTotBruOpeItem).toBe('110000');
    expect(d.dTotOpeItem).toBe('110000');
    expect(d.iAfecIVA).toBe('1');
    expect(d.dTasaIVA).toBe('10');
    expect(d.dPropIVA).toBe('100');
    expect(d.dBasGravIVA).toBe('100000');
    expect(d.dLiqIVAItem).toBe('10000');
    expect(d.dBasExe).toBe('0');
  });

  it('liquida IVA 5% incluido (round /21)', () => {
    // 105.000 al 5% → IVA = round(105000/21) = 5000, base = 100000.
    const p = mapearComprobanteACode100(
      comprobante({ items: [item({ precioUnitario: 105_000n, tasaIva: 'IVA_5' as TasaIva })] }),
    );
    const d = p.Detalles[0]!;
    expect(d.dTasaIVA).toBe('5');
    expect(d.dLiqIVAItem).toBe('5000');
    expect(d.dBasGravIVA).toBe('100000');
  });

  it('ítem exento → iAfecIVA=3, base exenta', () => {
    const p = mapearComprobanteACode100(
      comprobante({ items: [item({ precioUnitario: 50_000n, tasaIva: 'EXENTO' as TasaIva })] }),
    );
    const d = p.Detalles[0]!;
    expect(d.iAfecIVA).toBe('3');
    expect(d.dTasaIVA).toBe('0');
    expect(d.dBasGravIVA).toBe('0');
    expect(d.dLiqIVAItem).toBe('0');
    expect(d.dBasExe).toBe('50000');
  });

  it('descuento por ítem informa dDescItem y dPorcDesIt', () => {
    // 110.000 con descuento 10.000 → 9.09090909% (como en el ejemplo descuento item).
    const p = mapearComprobanteACode100(
      comprobante({ items: [item({ precioUnitario: 110_000n, descuentoUnitario: 10_000n })] }),
    );
    const d = p.Detalles[0]!;
    expect(d.dDescItem).toBe('10000');
    expect(d.dPorcDesIt).toBe('9.09090909');
    expect(d.dTotOpeItem).toBe('100000');
  });
});

describe('subtotales', () => {
  it('agrega subtotales discriminados por tasa', () => {
    const p = mapearComprobanteACode100(
      comprobante({
        items: [
          item({ precioUnitario: 110_000n, tasaIva: 'IVA_10' as TasaIva }),
          item({ precioUnitario: 50_000n, tasaIva: 'EXENTO' as TasaIva }),
        ],
        pagos: [{ metodo: 'EFECTIVO', monto: 160_000n }],
        total: 160_000n,
      }),
    );
    const s = p.Subtotales[0]!;
    expect(s.dSub10).toBe('110000');
    expect(s.dSubExe).toBe('50000');
    expect(s.dSub5).toBe('0');
    expect(s.dTotOpe).toBe('160000');
    expect(s.dIVA10).toBe('10000');
    expect(s.dTotIVA).toBe('10000');
    expect(s.dBaseGrav10).toBe('100000');
    expect(s.dTBasGraIVA).toBe('100000');
    expect(s.dTotGralOpe).toBe('160000');
  });
});

describe('forma de pago', () => {
  it('mapea métodos y omite FormaPago en crédito', () => {
    const contado = mapearComprobanteACode100(
      comprobante({ pagos: [{ metodo: 'BANCARD', monto: 110_000n }] }),
    );
    expect(contado.FormaPago).toHaveLength(1);
    expect(contado.FormaPago![0]!.iTiPago).toBe('21'); // pago electrónico
    expect(contado.FormaPago![0]!.cMoneTiPag).toBe('PYG');

    const credito = mapearComprobanteACode100(comprobante({ condicionVenta: 'CREDITO' }));
    expect(credito.iCondOpe).toBe('2');
    expect(credito.FormaPago).toBeUndefined();
  });
});

describe('descuento global (a nivel pedido) + recargo delivery', () => {
  it('prorratea el descuento global y reconcilia con el total', () => {
    // 2 ítems de 110.000 (220.000 bruto) con 22.000 de descuento global → total 198.000.
    const p = mapearComprobanteACode100(
      comprobante({
        items: [item({ precioUnitario: 110_000n }), item({ precioUnitario: 110_000n })],
        totalDescuento: 22_000n,
        pagos: [{ metodo: 'EFECTIVO', monto: 198_000n }],
        total: 198_000n,
      }),
    );
    expect(sumaDetalles(p.Detalles)).toBe(198_000n);
    expect(p.Subtotales[0]!.dTotGralOpe).toBe('198000');
    expect(p.Subtotales[0]!.dTotDescGlotem).toBe('22000');
    // Cada ítem recibió 11.000 de descuento global → neto 99.000.
    expect(p.Detalles[0]!.dTotOpeItem).toBe('99000');
    expect(p.Detalles[0]!.dDescGloItem).toBe('11000');
  });

  it('agrega el recargo de delivery como línea de servicio (IVA 10)', () => {
    const p = mapearComprobanteACode100(
      comprobante({
        items: [item({ precioUnitario: 110_000n })],
        recargoDelivery: 15_000n,
        pagos: [{ metodo: 'EFECTIVO', monto: 125_000n }],
        total: 125_000n,
      }),
    );
    expect(p.Detalles).toHaveLength(2);
    const delivery = p.Detalles[1]!;
    expect(delivery.dCodInt).toBe('DELIVERY');
    expect(delivery.dTotOpeItem).toBe('15000');
    expect(delivery.dTasaIVA).toBe('10');
    expect(sumaDetalles(p.Detalles)).toBe(125_000n);
    expect(p.Subtotales[0]!.dTotGralOpe).toBe('125000');
  });

  it('descuento + delivery juntos reconcilian; el delivery no recibe descuento', () => {
    // 110.000 ítem + 20.000 delivery, 11.000 descuento → total 119.000.
    const p = mapearComprobanteACode100(
      comprobante({
        items: [item({ precioUnitario: 110_000n })],
        totalDescuento: 11_000n,
        recargoDelivery: 20_000n,
        pagos: [{ metodo: 'EFECTIVO', monto: 119_000n }],
        total: 119_000n,
      }),
    );
    expect(sumaDetalles(p.Detalles)).toBe(119_000n);
    // Ítem: 110.000 - 11.000 = 99.000. Delivery intacto: 20.000.
    expect(p.Detalles[0]!.dTotOpeItem).toBe('99000');
    expect(p.Detalles[1]!.dTotOpeItem).toBe('20000');
  });

  it('cantidad > 1: el descuento global se expresa por unidad y reconcilia', () => {
    // 1 ítem qty 3 @ 100.000 (300.000), descuento 30.000 → total 270.000.
    const p = mapearComprobanteACode100(
      comprobante({
        items: [item({ precioUnitario: 100_000n, cantidad: 3 })],
        totalDescuento: 30_000n,
        pagos: [{ metodo: 'EFECTIVO', monto: 270_000n }],
        total: 270_000n,
      }),
    );
    expect(sumaDetalles(p.Detalles)).toBe(270_000n);
    expect(p.Detalles[0]!.dTotOpeItem).toBe('270000');
    expect(p.Detalles[0]!.dDescGloItem).toBe('10000'); // 30.000 / 3 unidades
  });

  it('residual de redondeo va a dRedon manteniendo dTotGralOpe = total', () => {
    // Total con 1 Gs de redondeo: ítems suman 110.000 pero el cliente paga 109.999.
    const p = mapearComprobanteACode100(
      comprobante({
        items: [item({ precioUnitario: 110_000n })],
        pagos: [{ metodo: 'EFECTIVO', monto: 109_999n }],
        total: 109_999n,
      }),
    );
    expect(p.Subtotales[0]!.dRedon).toBe('1');
    expect(p.Subtotales[0]!.dTotGralOpe).toBe('109999');
  });

  it('falla si los ítems no reconcilian con el total (diferencia grande)', () => {
    expect(() =>
      mapearComprobanteACode100(
        comprobante({
          items: [item({ precioUnitario: 110_000n })],
          total: 50_000n, // incoherente
        }),
      ),
    ).toThrow(/no reconcilia/);
  });
});

describe('nota de crédito', () => {
  it('referencia el CDC del comprobante original', () => {
    const cdc = '01123456789001001000000122025010111234567890';
    const p = mapearComprobanteACode100(
      comprobante({
        tipoDocumento: 'NOTA_CREDITO',
        comprobanteOriginal: { cdc, tipoDocumento: 'FACTURA' },
      }),
    );
    expect(p.iTiDE).toBe('5');
    expect(p.iMotEmi).toBe('1');
    expect(p.DocumentosAsociados).toHaveLength(1);
    expect(p.DocumentosAsociados![0]!.iTipDocAso).toBe('1');
    expect(p.DocumentosAsociados![0]!.dCdCDERef).toBe(cdc);
  });

  it('NC no incluye campos exclusivos de Factura (iTipTra/iIndPres/iCondOpe/FormaPago)', () => {
    const p = mapearComprobanteACode100(
      comprobante({
        tipoDocumento: 'NOTA_CREDITO',
        comprobanteOriginal: { cdc: '0'.repeat(44), tipoDocumento: 'FACTURA' },
      }),
    );
    expect(p.iTipTra).toBeUndefined();
    expect(p.iIndPres).toBeUndefined();
    expect(p.iCondOpe).toBeUndefined();
    expect(p.FormaPago).toBeUndefined();
    // Pero sí mantiene header fiscal + receptor + detalles.
    expect(p.iTImp).toBe('1');
    expect(p.cMoneOpe).toBe('PYG');
    expect(p.dNomRec).toBeDefined();
    expect(p.Detalles.length).toBeGreaterThan(0);
  });
});

describe('factura sí incluye los campos de cabecera de venta', () => {
  it('iTipTra/iIndPres/iCondOpe presentes en factura', () => {
    const p = mapearComprobanteACode100(comprobante());
    expect(p.iTipTra).toBe('1');
    expect(p.iIndPres).toBe('1');
    expect(p.iCondOpe).toBe('1');
  });
});
