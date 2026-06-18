import { EstadoComprobante, EstadoSifen, type Prisma, TipoDocumentoFiscal } from '@prisma/client';

import { logger } from '../../config/logger.js';
import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import { cargarCredenciales } from './facturacion-config.service.js';
import { getFacturadorProvider } from './provider/factory.js';
import { type DocumentoIdent, MapeoError } from './provider/types.js';

import type { ComprobanteCode100Input } from './code100.mapper.js';
import type { Code100Client, Code100Credentials, EstadoNormalizado } from '@smash/code100-client';

/**
 * Orquestación de la emisión de un documento electrónico.
 *
 * Flujo (lo ejecuta el worker), independiente del proveedor (CODE100 o
 * middleware propio — ver `provider/`):
 *   1. Alta del documento — el proveedor devuelve error de rechazo o null.
 *   2. Polling/consulta de estado hasta que SIFEN lo procese.
 *   3. Persistencia del resultado (cdc/qr/estado) + EventoSifen de auditoría.
 *
 * Idempotencia: tras un alta exitosa el comprobante queda PENDIENTE. Si el
 * proceso muere a mitad del polling, un reintento detecta PENDIENTE y SÓLO
 * consulta (no re-da de alta) para no duplicar el documento en SIFEN.
 */

// Re-export de las funciones puras (su hogar es emision.core; se mantienen acá
// para compatibilidad de imports/tests).
export { intentarAlta, pollEstado } from './emision.core.js';
export type { PollDeps } from './emision.core.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Procesador (wiring con Prisma) — lo invoca el worker
// ─────────────────────────────────────────────────────────────────────────────

const COMP_INCLUDE = {
  items: true,
  pagos: true,
  comprobanteOriginal: { select: { cdc: true, tipoDocumento: true } },
} satisfies Prisma.ComprobanteInclude;

type ComprobanteEmision = Prisma.ComprobanteGetPayload<{ include: typeof COMP_INCLUDE }>;

const EV_ENVIANDO = 'ENVIANDO';
const EV_APROBADO = 'APROBADO';
const EV_RECHAZADO = 'RECHAZADO';

export interface ProcesarEmisionResultado {
  comprobanteId: string;
  estadoSifen: EstadoSifen;
  cdc?: string;
  mensaje?: string;
}

/**
 * Procesa la emisión de un comprobante. Pensado para ejecutarse como job de la
 * cola `facturacion`. El `clientFactory` permite inyectar un cliente CODE100 en
 * tests; por defecto el proveedor se resuelve por config (`FACTURADOR_PROVIDER`).
 */
export async function procesarEmision(
  comprobanteId: string,
  clientFactory?: (creds: Code100Credentials) => Code100Client,
): Promise<ProcesarEmisionResultado> {
  const comp = await prisma.comprobante.findUnique({
    where: { id: comprobanteId },
    include: COMP_INCLUDE,
  });
  if (!comp) throw Errors.notFound('Comprobante no encontrado');

  // Guards: no enviar tickets ni documentos ya finalizados.
  if (comp.tipoDocumento === TipoDocumentoFiscal.TICKET) {
    throw Errors.conflict('Los tickets no se envían a SIFEN');
  }
  if (
    comp.estado === EstadoComprobante.ANULADO ||
    comp.estadoSifen === EstadoSifen.APROBADO ||
    comp.estadoSifen === EstadoSifen.CANCELADO
  ) {
    return { comprobanteId, estadoSifen: comp.estadoSifen };
  }

  const cfg = await cargarCredenciales(comp.empresaId);
  if (!cfg.activo) {
    logger.info({ comprobanteId }, 'Facturación inactiva para la empresa — se omite envío');
    return { comprobanteId, estadoSifen: comp.estadoSifen };
  }

  const provider = getFacturadorProvider(cfg.credentials, clientFactory);

  const ident: DocumentoIdent = {
    establecimiento: comp.establecimiento,
    puntoExpedicion: comp.puntoExpedicionCodigo,
    numero: comp.numero,
    tipoDocumento: comp.tipoDocumento,
    referenciaExterna: comp.id,
  };

  // Si ya fue dado de alta (PENDIENTE), sólo reconciliamos por consulta.
  const yaEnviado = comp.estadoSifen === EstadoSifen.PENDIENTE;

  if (!yaEnviado) {
    let errorAlta: string | null;
    try {
      errorAlta = await provider.darDeAlta(toMapperInput(comp), comp.id);
    } catch (err) {
      // MapeoError = permanente (documento mal construido) → rechazar sin reintentar.
      // Cualquier otro error (red/5xx) se propaga para que el worker reintente.
      if (err instanceof MapeoError) {
        await persistirRechazo(comp.id, `No se pudo construir el documento: ${err.message}`);
        return { comprobanteId, estadoSifen: EstadoSifen.RECHAZADO, mensaje: err.message };
      }
      throw err;
    }
    if (errorAlta) {
      await persistirRechazo(comp.id, errorAlta);
      return { comprobanteId, estadoSifen: EstadoSifen.RECHAZADO, mensaje: errorAlta };
    }
    // Alta OK → marcar PENDIENTE + crear evento ENVIANDO (idempotency record).
    await prisma.$transaction([
      prisma.comprobante.update({
        where: { id: comp.id },
        data: {
          estadoSifen: EstadoSifen.PENDIENTE,
          fechaEnvioSifen: new Date(),
          motivoRechazoSifen: null,
        },
      }),
      prisma.eventoSifen.create({
        data: { comprobanteId: comp.id, tipo: 'ENVIO', estado: EV_ENVIANDO },
      }),
    ]);
  }

  const resultado = await provider.consultar(ident);
  return persistirResultado(comp.id, resultado);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Persistencia
// ─────────────────────────────────────────────────────────────────────────────

async function persistirResultado(
  comprobanteId: string,
  r: EstadoNormalizado,
): Promise<ProcesarEmisionResultado> {
  if (r.estado === 'APROBADO') {
    await prisma.$transaction([
      prisma.comprobante.update({
        where: { id: comprobanteId },
        data: {
          estadoSifen: EstadoSifen.APROBADO,
          cdc: r.cdc ?? undefined,
          qrUrl: r.enlaceQr ?? undefined,
          fechaAprobacionSifen: new Date(),
          motivoRechazoSifen: null,
        },
      }),
      prisma.eventoSifen.updateMany({
        where: { comprobanteId, tipo: 'ENVIO', estado: EV_ENVIANDO },
        data: { estado: EV_APROBADO, motivo: r.mensaje, respondidoEn: new Date() },
      }),
    ]);
    return { comprobanteId, estadoSifen: EstadoSifen.APROBADO, cdc: r.cdc, mensaje: r.mensaje };
  }

  if (r.estado === 'RECHAZADO') {
    await persistirRechazo(comprobanteId, r.mensaje ?? 'Rechazado por SIFEN', r.cdc);
    return { comprobanteId, estadoSifen: EstadoSifen.RECHAZADO, mensaje: r.mensaje };
  }

  if (r.estado === 'CANCELADO') {
    await prisma.comprobante.update({
      where: { id: comprobanteId },
      data: { estadoSifen: EstadoSifen.CANCELADO, cdc: r.cdc ?? undefined },
    });
    return { comprobanteId, estadoSifen: EstadoSifen.CANCELADO, cdc: r.cdc };
  }

  // PENDIENTE / NO_ENCONTRADO: SIFEN aún no procesó. Persistir CDC si vino y
  // lanzar para que BullMQ reintente (el reintento sólo consultará, no re-alta).
  if (r.cdc) {
    await prisma.comprobante.update({ where: { id: comprobanteId }, data: { cdc: r.cdc } });
  }
  throw new EmisionPendienteError(comprobanteId);
}

async function persistirRechazo(
  comprobanteId: string,
  motivo: string,
  cdc?: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.comprobante.update({
      where: { id: comprobanteId },
      data: {
        estadoSifen: EstadoSifen.RECHAZADO,
        motivoRechazoSifen: motivo,
        cdc: cdc ?? undefined,
      },
    }),
    prisma.eventoSifen.updateMany({
      where: { comprobanteId, tipo: 'ENVIO', estado: EV_ENVIANDO },
      data: { estado: EV_RECHAZADO, motivo, respondidoEn: new Date() },
    }),
  ]);
}

/** Error transitorio: el documento sigue PENDIENTE en SIFEN. Dispara reintento. */
export class EmisionPendienteError extends Error {
  constructor(comprobanteId: string) {
    super(`Documento ${comprobanteId} aún PENDIENTE en SIFEN — se reintentará`);
    this.name = 'EmisionPendienteError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers de mapeo del modelo Prisma al input del mapper/proveedor
// ─────────────────────────────────────────────────────────────────────────────

function toMapperInput(comp: ComprobanteEmision): ComprobanteCode100Input {
  return {
    tipoDocumento: comp.tipoDocumento,
    establecimiento: comp.establecimiento,
    puntoExpedicionCodigo: comp.puntoExpedicionCodigo,
    numero: comp.numero,
    fechaEmision: comp.fechaEmision,
    condicionVenta: comp.condicionVenta,
    receptorTipoContribuyente: comp.receptorTipoContribuyente,
    receptorRuc: comp.receptorRuc,
    receptorDv: comp.receptorDv,
    receptorDocumento: comp.receptorDocumento,
    receptorRazonSocial: comp.receptorRazonSocial,
    receptorEmail: comp.receptorEmail,
    receptorDireccion: comp.receptorDireccion,
    items: comp.items.map((it) => ({
      codigo: it.codigo,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precioUnitario: it.precioUnitario,
      descuentoUnitario: it.descuentoUnitario,
      tasaIva: it.tasaIva,
      subtotal: it.subtotal,
    })),
    pagos: comp.pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
    totalDescuento: comp.totalDescuento,
    recargoDelivery: comp.recargoDelivery,
    total: comp.total,
    comprobanteOriginal: comp.comprobanteOriginal,
  };
}
