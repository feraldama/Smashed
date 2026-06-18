import {
  CondicionVenta,
  MetodoPago,
  TasaIva,
  TipoContribuyente,
  TipoDocumentoFiscal,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { comprobanteACanonical } from './middleware.provider.js';
import { MapeoError } from './types.js';

import type { ComprobanteCode100Input } from '../code100.mapper.js';

interface CanonReceptor {
  naturaleza: string;
  tipoOperacion: string;
  ruc?: string;
  dvRuc?: string;
}
interface CanonItem {
  codigoInterno: string;
  precioUnitario: number;
  afectacionIVA: string;
  tasaIVA: number;
}
interface Canon {
  tipo: string;
  referenciaExterna: string;
  numeracion: { establecimiento: string; puntoExpedicion: string; numero: string };
  receptor: CanonReceptor;
  items: CanonItem[];
  pagos: Array<{ forma: string; monto: number }>;
}

function comprobante(over: Partial<ComprobanteCode100Input> = {}): ComprobanteCode100Input {
  return {
    tipoDocumento: TipoDocumentoFiscal.FACTURA,
    establecimiento: '001',
    puntoExpedicionCodigo: '001',
    numero: 1234,
    fechaEmision: new Date('2024-08-14T14:11:00.000Z'),
    condicionVenta: CondicionVenta.CONTADO,
    receptorTipoContribuyente: TipoContribuyente.CONSUMIDOR_FINAL,
    receptorRuc: null,
    receptorDv: null,
    receptorDocumento: '0',
    receptorRazonSocial: 'Consumidor Final',
    receptorEmail: null,
    receptorDireccion: null,
    items: [
      {
        codigo: 'HB1',
        descripcion: 'Hamburguesa',
        cantidad: 2,
        precioUnitario: 25000n,
        descuentoUnitario: 0n,
        tasaIva: TasaIva.IVA_10,
        subtotal: 50000n,
      },
    ],
    pagos: [{ metodo: MetodoPago.EFECTIVO, monto: 50000n }],
    totalDescuento: 0n,
    recargoDelivery: 0n,
    total: 50000n,
    comprobanteOriginal: null,
    ...over,
  };
}

const canon = (comp: ComprobanteCode100Input, ref: string): Canon =>
  comprobanteACanonical(comp, ref) as unknown as Canon;

describe('comprobanteACanonical', () => {
  it('mapea una factura a consumidor final', () => {
    const doc = canon(comprobante(), 'COMP-1');
    expect(doc.tipo).toBe('FACTURA');
    expect(doc.referenciaExterna).toBe('COMP-1');
    expect(doc.numeracion).toMatchObject({ establecimiento: '001', numero: '0001234' });
    expect(doc.receptor.naturaleza).toBe('NO_CONTRIBUYENTE');
    expect(doc.receptor.tipoOperacion).toBe('B2C');
    expect(doc.items[0]).toMatchObject({
      precioUnitario: 25000,
      afectacionIVA: 'GRAVADO',
      tasaIVA: 10,
    });
    expect(doc.pagos[0]).toMatchObject({ forma: 'EFECTIVO', monto: 50000 });
  });

  it('mapea receptor contribuyente con ruc (sin exigir dv)', () => {
    const doc = canon(
      comprobante({
        receptorTipoContribuyente: TipoContribuyente.PERSONA_JURIDICA,
        receptorRuc: '80069563',
        receptorDv: null,
        receptorRazonSocial: 'Empresa SA',
      }),
      'COMP-2',
    );
    expect(doc.receptor.naturaleza).toBe('CONTRIBUYENTE');
    expect(doc.receptor.ruc).toBe('80069563');
    expect(doc.receptor.dvRuc).toBeUndefined();
  });

  it('agrega una línea de delivery cuando hay recargo', () => {
    const doc = canon(comprobante({ recargoDelivery: 12000n }), 'COMP-3');
    expect(doc.items).toHaveLength(2);
    expect(doc.items[1]).toMatchObject({ codigoInterno: 'DELIVERY', precioUnitario: 12000 });
  });

  it('lanza MapeoError para tipos distintos de FACTURA', () => {
    expect(() =>
      comprobanteACanonical(comprobante({ tipoDocumento: TipoDocumentoFiscal.NOTA_CREDITO }), 'X'),
    ).toThrow(MapeoError);
  });

  it('lanza MapeoError ante descuento global (no soportado aún)', () => {
    expect(() => comprobanteACanonical(comprobante({ totalDescuento: 5000n }), 'X')).toThrow(
      MapeoError,
    );
  });
});
