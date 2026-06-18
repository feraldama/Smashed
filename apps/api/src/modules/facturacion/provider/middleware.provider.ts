import { MetodoPago, TasaIva, TipoContribuyente, TipoDocumentoFiscal } from '@prisma/client';

import { type DocumentoIdent, type FacturadorProvider, MapeoError } from './types.js';

import type { ComprobanteCode100Input } from '../code100.mapper.js';
import type { EstadoNormalizado } from '@smash/code100-client';

/**
 * Proveedor del middleware propio (`sifen-middleware`). Mapea el comprobante de
 * Smash al documento canónico del middleware y lo emite por HTTP. Ruta usada
 * sólo en la rama Sifen (toggle por config); `main` sigue con CODE100.
 */

const IVA: Record<TasaIva, { afectacionIVA: string; tasaIVA: number }> = {
  [TasaIva.IVA_10]: { afectacionIVA: 'GRAVADO', tasaIVA: 10 },
  [TasaIva.IVA_5]: { afectacionIVA: 'GRAVADO', tasaIVA: 5 },
  [TasaIva.IVA_0]: { afectacionIVA: 'GRAVADO', tasaIVA: 0 },
  [TasaIva.EXENTO]: { afectacionIVA: 'EXENTO', tasaIVA: 0 },
};

const FORMA_PAGO: Record<MetodoPago, string> = {
  [MetodoPago.EFECTIVO]: 'EFECTIVO',
  [MetodoPago.BANCARD]: 'TARJETA_CREDITO',
  [MetodoPago.DINELCO]: 'TARJETA_DEBITO',
  [MetodoPago.TRANSFERENCIA]: 'TRANSFERENCIA',
  [MetodoPago.CHEQUE]: 'CHEQUE',
};

/** Mapea un comprobante de Smash al documento canónico del middleware (FACTURA). */
export function comprobanteACanonical(
  comp: ComprobanteCode100Input,
  referenciaExterna: string,
): Record<string, unknown> {
  if (comp.tipoDocumento !== TipoDocumentoFiscal.FACTURA) {
    throw new MapeoError(
      `El middleware sólo soporta FACTURA por ahora (recibido ${comp.tipoDocumento})`,
    );
  }
  if (comp.totalDescuento > 0n) {
    throw new MapeoError('Descuento global todavía no soportado por el mapeo al middleware');
  }

  const esConsumidorFinal =
    comp.receptorTipoContribuyente === TipoContribuyente.CONSUMIDOR_FINAL || !comp.receptorRuc;

  const items = comp.items.map((it) => ({
    codigoInterno: it.codigo ?? 'SIN-CODIGO',
    descripcion: it.descripcion,
    cantidad: it.cantidad,
    precioUnitario: Number(it.precioUnitario),
    descuento: Number(it.descuentoUnitario),
    ...IVA[it.tasaIva],
  }));
  if (comp.recargoDelivery > 0n) {
    items.push({
      codigoInterno: 'DELIVERY',
      descripcion: 'Servicio de delivery',
      cantidad: 1,
      precioUnitario: Number(comp.recargoDelivery),
      descuento: 0,
      ...IVA[TasaIva.IVA_10],
    });
  }

  return {
    tipo: 'FACTURA',
    referenciaExterna,
    numeracion: {
      establecimiento: comp.establecimiento,
      puntoExpedicion: comp.puntoExpedicionCodigo,
      numero: String(comp.numero).padStart(7, '0'),
    },
    fechaEmision: comp.fechaEmision.toISOString(),
    moneda: 'PYG',
    condicionVenta: comp.condicionVenta,
    receptor: {
      naturaleza: esConsumidorFinal ? 'NO_CONTRIBUYENTE' : 'CONTRIBUYENTE',
      tipoOperacion: esConsumidorFinal ? 'B2C' : 'B2B',
      nombre: comp.receptorRazonSocial,
      ...(esConsumidorFinal
        ? { tipoDocumento: '1', numeroDocumento: comp.receptorDocumento ?? '0' }
        : { ruc: comp.receptorRuc, dvRuc: comp.receptorDv ?? undefined }),
      direccion: comp.receptorDireccion ?? undefined,
      email: comp.receptorEmail ?? undefined,
    },
    items,
    pagos: comp.pagos.map((p) => ({
      forma: FORMA_PAGO[p.metodo],
      monto: Number(p.monto),
      moneda: 'PYG',
    })),
  };
}

interface ResultadoMiddleware {
  estado: string;
  cdc?: string;
  enlaceQR?: string;
  observaciones?: { codigo: string; mensaje: string }[];
}

function aEstadoNormalizado(r: ResultadoMiddleware): EstadoNormalizado {
  const mensaje = r.observaciones?.map((o) => o.mensaje).join('; ');
  switch (r.estado) {
    case 'APROBADO':
    case 'APROBADO_CON_OBSERVACION':
      return { estado: 'APROBADO', procesado: true, cdc: r.cdc, enlaceQr: r.enlaceQR, mensaje };
    case 'RECHAZADO':
      return { estado: 'RECHAZADO', procesado: true, cdc: r.cdc, mensaje };
    case 'CANCELADO':
      return { estado: 'CANCELADO', procesado: true, cdc: r.cdc };
    default:
      return { estado: 'PENDIENTE', procesado: false, cdc: r.cdc };
  }
}

export class MiddlewareProvider implements FacturadorProvider {
  readonly nombre = 'middleware' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private get headers(): Record<string, string> {
    return { 'content-type': 'application/json', 'x-api-key': this.apiKey };
  }

  async darDeAlta(
    comp: ComprobanteCode100Input,
    referenciaExterna: string,
  ): Promise<string | null> {
    // comprobanteACanonical lanza MapeoError (permanente) si no se puede construir.
    const doc = comprobanteACanonical(comp, referenciaExterna);

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v1/documentos`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(doc),
      });
    } catch (err) {
      // Error de red → transitorio → propagar para que el worker reintente.
      throw new Error(
        `Error de transporte con el middleware: ${err instanceof Error ? err.message : err}`,
      );
    }

    if (res.status === 400 || res.status === 422) {
      const body = (await res.json().catch(() => ({}))) as { error?: unknown };
      throw new MapeoError(
        `Documento rechazado por el middleware: ${JSON.stringify(body.error ?? body)}`,
      );
    }
    if (!res.ok) {
      throw new Error(`Middleware respondió HTTP ${res.status}`);
    }

    const body = (await res.json()) as ResultadoMiddleware;
    if (body.estado === 'RECHAZADO') {
      return body.observaciones?.map((o) => o.mensaje).join('; ') ?? 'Rechazado por SIFEN';
    }
    return null;
  }

  async consultar(ident: DocumentoIdent): Promise<EstadoNormalizado> {
    let res: Response;
    try {
      res = await this.fetchImpl(
        `${this.baseUrl}/v1/documentos/${encodeURIComponent(ident.referenciaExterna)}`,
        { headers: this.headers },
      );
    } catch (err) {
      throw new Error(
        `Error de transporte con el middleware: ${err instanceof Error ? err.message : err}`,
      );
    }
    if (res.status === 404) {
      return { estado: 'NO_ENCONTRADO', procesado: false };
    }
    if (!res.ok) {
      throw new Error(`Middleware respondió HTTP ${res.status}`);
    }
    return aEstadoNormalizado((await res.json()) as ResultadoMiddleware);
  }
}
