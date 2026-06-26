import { EstadoComprobante, EstadoSifen, type Prisma, TipoDocumentoFiscal } from '@prisma/client';
import {
  type Code100Client,
  type Code100ConsultaPayload,
  type Code100Credentials,
  type EstadoNormalizado,
  errorDeAlta,
  normalizarEstado,
  tipoDocAbrev,
} from '@smash/code100-client';

import { logger } from '../../config/logger.js';
import { createCode100Client } from '../../lib/code100.js';
import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import { mapearComprobanteACode100 } from './code100.mapper.js';
import { cargarCredenciales } from './facturacion-config.service.js';

/**
 * Orquestación de la emisión de un documento electrónico vía CODE100.
 *
 * Flujo (lo ejecuta el worker):
 *   1. Alta del documento (tipOpe=1) — asíncrono, no devuelve CDC.
 *   2. Polling de consulta de estado (tipOpe=2) hasta que SIFEN lo procese.
 *   3. Persistencia del resultado (cdc/qr/estado) + EventoSifen de auditoría.
 *
 * Idempotencia (clave para no duplicar documentos fiscales):
 *   - ANTES del alta se persiste el estado ENVIANDO (intent marker durable).
 *   - Tras un alta exitosa el comprobante pasa a PENDIENTE.
 *   - En una recuperación:
 *       · PENDIENTE → el alta ya está confirmada → sólo consulta.
 *       · ENVIANDO  → el alta quedó a mitad (crash); NO se re-da de alta a
 *         ciegas: se CONSULTA a SIFEN y sólo si responde NO_ENCONTRADO se
 *         re-intenta el alta. Así un crash entre "alta enviada" y "PENDIENTE
 *         persistido" no genera un segundo documento en SIFEN.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Máquina de estados (pura respecto a Prisma — testeable con mock client)
// ─────────────────────────────────────────────────────────────────────────────

export interface PollDeps {
  client: Pick<Code100Client, 'consultarEstado'>;
  creds: Code100Credentials;
  consulta: Code100ConsultaPayload;
  /** Máximo de consultas antes de rendirse y dejar PENDIENTE. Default 8. */
  maxIntentos?: number;
  /** Delay entre consultas según el intento (0-based). Default backoff escalonado. */
  delayMs?: (intento: number) => number;
  /** Inyectable para tests. */
  sleep?: (ms: number) => Promise<void>;
}

const DELAY_ESCALONADO = [1_000, 2_000, 3_000, 5_000, 8_000, 10_000, 15_000, 15_000];

function delayPorDefecto(intento: number): number {
  return DELAY_ESCALONADO[Math.min(intento, DELAY_ESCALONADO.length - 1)] ?? 15_000;
}

function sleepReal(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Consulta el estado del documento hasta que SIFEN lo procese (aprobado/
 * rechazado/cancelado) o se agoten los intentos (queda PENDIENTE).
 */
export async function pollEstado(deps: PollDeps): Promise<EstadoNormalizado> {
  const maxIntentos = deps.maxIntentos ?? 8;
  const delayMs = deps.delayMs ?? delayPorDefecto;
  const sleep = deps.sleep ?? sleepReal;

  let ultimo: EstadoNormalizado = { estado: 'PENDIENTE', procesado: false };
  for (let intento = 0; intento < maxIntentos; intento++) {
    const res = await deps.client.consultarEstado(deps.creds, deps.consulta);
    ultimo = normalizarEstado(res);
    if (ultimo.procesado || ultimo.estado === 'CANCELADO') return ultimo;
    if (intento < maxIntentos - 1) await sleep(delayMs(intento));
  }
  return ultimo;
}

/** Intenta el alta. Devuelve el mensaje de error si fue rechazada, o null si OK. */
export async function intentarAlta(
  client: Pick<Code100Client, 'altaDocumento'>,
  creds: Code100Credentials,
  payload: Parameters<Code100Client['altaDocumento']>[1],
): Promise<string | null> {
  const res = await client.altaDocumento(creds, payload);
  return errorDeAlta(res);
}

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
 * Procesa la emisión de un comprobante. Pensado para ejecutarse como job de
 * la cola `facturacion`. El `clientFactory` permite inyectar un cliente en
 * tests; por defecto crea uno real contra el dominio de la empresa.
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

  const client = clientFactory ? clientFactory(cfg.credentials) : createCode100Client();

  const consulta: Code100ConsultaPayload = {
    dEst: comp.establecimiento,
    dPunExp: comp.puntoExpedicionCodigo,
    dNumDoc: String(comp.numero).padStart(7, '0'),
    tipoDoc: tipoDocAbrev(mapTipoDE(comp.tipoDocumento)),
  };

  // Decisión según el estado SIFEN actual:
  //  - PENDIENTE: el alta ya está confirmada → sólo consultar (idempotente).
  //  - ENVIANDO:  el alta quedó a mitad (crash) → CONSULTAR primero; sólo re-dar
  //    de alta si SIFEN responde NO_ENCONTRADO (evita duplicar el documento).
  //  - resto (NO_ENVIADO / RECHAZADO): primer intento (o reintento) de alta.
  const creds = cfg.credentials;

  if (comp.estadoSifen === EstadoSifen.PENDIENTE) {
    return persistirResultado(comp.id, await pollEstado({ client, creds, consulta }));
  }

  if (comp.estadoSifen === EstadoSifen.ENVIANDO) {
    // El alta quedó a mitad (crash). Consultamos a SIFEN para saber si lo tiene.
    // Usamos varios intentos a propósito: `normalizarEstado` mapea CUALQUIER
    // error de transporte (timeout, 5xx, sesión vencida) a NO_ENCONTRADO, y el
    // alta de SIFEN es asíncrono — un único intento podría concluir "no existe"
    // por un error transitorio o por latencia de ingestión, y re-dar de alta
    // duplicaría el documento. Sólo re-damos de alta si SIFEN insiste en no
    // tenerlo tras reintentar.
    const sonda = await pollEstado({ client, creds, consulta, maxIntentos: 3 });
    if (sonda.estado !== 'NO_ENCONTRADO') {
      // SIFEN sí tiene el documento → el alta había llegado. Confirmar PENDIENTE
      // y persistir según el estado de la sonda (si aún no está procesado,
      // persistirResultado relanza y el barrido vuelve a consultar). No re-alta.
      await marcarPendiente(comp.id);
      return persistirResultado(comp.id, sonda);
    }
    // NO_ENCONTRADO tras varios intentos → el alta no llegó → re-alta seguro (sigue abajo).
  }

  return altaYReconciliar(comp, client, creds, consulta);
}

/**
 * Primer envío (o reintento) de un comprobante: persiste el intent marker
 * ENVIANDO ANTES del alta, da de alta y arranca el polling. El marcador durable
 * garantiza que, si el proceso muere tras el alta, la recuperación consulte en
 * vez de re-dar de alta — no duplica el documento fiscal.
 */
async function altaYReconciliar(
  comp: ComprobanteEmision,
  client: Code100Client,
  creds: Code100Credentials,
  consulta: Code100ConsultaPayload,
): Promise<ProcesarEmisionResultado> {
  // Errores de mapeo (tipo no soportado, totales que no reconcilian) son
  // permanentes: marcar RECHAZADO sin reintentar (no relanzar al worker).
  let payload;
  try {
    payload = mapearComprobanteACode100(toMapperInput(comp));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await persistirRechazo(comp.id, `No se pudo construir el documento: ${msg}`);
    return { comprobanteId: comp.id, estadoSifen: EstadoSifen.RECHAZADO, mensaje: msg };
  }

  // Intent marker durable ANTES del alta (estado + evento de auditoría).
  await prisma.$transaction([
    prisma.comprobante.update({
      where: { id: comp.id },
      data: {
        estadoSifen: EstadoSifen.ENVIANDO,
        fechaEnvioSifen: new Date(),
        motivoRechazoSifen: null,
      },
    }),
    prisma.eventoSifen.create({
      data: { comprobanteId: comp.id, tipo: 'ENVIO', estado: EV_ENVIANDO },
    }),
  ]);

  const errorAlta = await intentarAlta(client, creds, payload);
  if (errorAlta) {
    await persistirRechazo(comp.id, errorAlta);
    return { comprobanteId: comp.id, estadoSifen: EstadoSifen.RECHAZADO, mensaje: errorAlta };
  }

  // Alta OK → confirmar PENDIENTE y pasar al polling de estado.
  await marcarPendiente(comp.id);
  return persistirResultado(comp.id, await pollEstado({ client, creds, consulta }));
}

/** ENVIANDO → PENDIENTE: el alta quedó confirmada (enviada/encontrada en SIFEN). */
async function marcarPendiente(comprobanteId: string): Promise<void> {
  await prisma.comprobante.update({
    where: { id: comprobanteId },
    data: { estadoSifen: EstadoSifen.PENDIENTE },
  });
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
//  Helpers de mapeo del modelo Prisma al input del mapper
// ─────────────────────────────────────────────────────────────────────────────

function toMapperInput(comp: ComprobanteEmision) {
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

function mapTipoDE(t: TipoDocumentoFiscal) {
  switch (t) {
    case TipoDocumentoFiscal.FACTURA:
      return '1' as const;
    case TipoDocumentoFiscal.AUTOFACTURA:
      return '4' as const;
    case TipoDocumentoFiscal.NOTA_CREDITO:
      return '5' as const;
    case TipoDocumentoFiscal.NOTA_DEBITO:
      return '6' as const;
    case TipoDocumentoFiscal.NOTA_REMISION:
      return '7' as const;
    default:
      return '1' as const;
  }
}
