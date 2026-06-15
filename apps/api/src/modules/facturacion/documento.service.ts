import { EstadoComprobante, EstadoSifen, TipoDocumentoFiscal } from '@prisma/client';
import {
  type Code100ConsultaPayload,
  errorDeAlta,
  normalizarEstado,
  tipoDocAbrev,
} from '@smash/code100-client';

import { createCode100Client } from '../../lib/code100.js';
import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import { cargarCredenciales } from './facturacion-config.service.js';
import { dispararEmision } from './facturacion-runner.js';

/**
 * Operaciones sobre un documento electrónico ya emitido: obtener la
 * representación gráfica (KUDE), el XML firmado, consultar estado y reenviar.
 *
 * Todas verifican tenant (empresa) salvo super admin.
 */

interface DocCtx {
  empresaId: string | null;
  isSuperAdmin: boolean;
}

async function cargarComprobanteFiscal(ctx: DocCtx, comprobanteId: string) {
  const comp = await prisma.comprobante.findUnique({ where: { id: comprobanteId } });
  if (!comp) throw Errors.notFound('Comprobante no encontrado');
  if (!ctx.isSuperAdmin && comp.empresaId !== ctx.empresaId) throw Errors.tenantMismatch();
  if (comp.tipoDocumento === TipoDocumentoFiscal.TICKET) {
    throw Errors.conflict('Los tickets no tienen documento electrónico');
  }
  return comp;
}

function consultaDe(comp: {
  establecimiento: string;
  puntoExpedicionCodigo: string;
  numero: number;
  tipoDocumento: TipoDocumentoFiscal;
}): Code100ConsultaPayload {
  return {
    dEst: comp.establecimiento,
    dPunExp: comp.puntoExpedicionCodigo,
    dNumDoc: String(comp.numero).padStart(7, '0'),
    tipoDoc: tipoDocAbrev(mapTipoDE(comp.tipoDocumento)),
  };
}

/** KUDE (PDF en base64). `ticket=true` devuelve formato cinta de papel. */
export async function obtenerKude(ctx: DocCtx, comprobanteId: string, ticket = false) {
  const comp = await cargarComprobanteFiscal(ctx, comprobanteId);
  const cfg = await cargarCredenciales(comp.empresaId);
  const client = createCode100Client();
  const res = await client.obtenerKude(cfg.credentials, { ...consultaDe(comp), ticket });
  if (res.status !== 'success' || !res.kude) {
    throw Errors.conflict(res.message ?? 'No se pudo obtener el KUDE');
  }
  return { cdc: res.CDC ?? comp.cdc, kudeBase64: res.kude };
}

/** XML firmado (base64). */
export async function obtenerXml(ctx: DocCtx, comprobanteId: string) {
  const comp = await cargarComprobanteFiscal(ctx, comprobanteId);
  const cfg = await cargarCredenciales(comp.empresaId);
  const client = createCode100Client();
  const res = await client.obtenerXml(cfg.credentials, consultaDe(comp));
  if (res.status !== 'success' || !res.xml) {
    throw Errors.conflict(res.message ?? 'No se pudo obtener el XML');
  }
  return { cdc: res.CDC ?? comp.cdc, xmlBase64: res.xml };
}

/** Consulta el estado actual en SIFEN (no persiste — sólo lectura). */
export async function consultarEstado(ctx: DocCtx, comprobanteId: string) {
  const comp = await cargarComprobanteFiscal(ctx, comprobanteId);
  const cfg = await cargarCredenciales(comp.empresaId);
  const client = createCode100Client();
  const res = await client.consultarEstado(cfg.credentials, consultaDe(comp));
  const n = normalizarEstado(res);
  return {
    comprobanteId,
    estadoLocal: comp.estadoSifen,
    estadoSifen: n.estado,
    cdc: n.cdc ?? comp.cdc,
    protocolo: n.protocolo,
    mensaje: n.mensaje,
  };
}

/**
 * Reencola la emisión de un comprobante que no quedó aprobado (NO_ENVIADO,
 * RECHAZADO o PENDIENTE). No re-encola los ya aprobados/cancelados.
 */
export async function reenviar(ctx: DocCtx, comprobanteId: string) {
  const comp = await cargarComprobanteFiscal(ctx, comprobanteId);
  if (comp.estadoSifen === EstadoSifen.APROBADO || comp.estadoSifen === EstadoSifen.CANCELADO) {
    throw Errors.conflict(`El comprobante ya está ${comp.estadoSifen} — no se reenvía`);
  }
  // Procesamiento en segundo plano (in-process). El estado final se ve al
  // refrescar o consultar; el barrido de reconciliación cubre los reintentos.
  dispararEmision(comprobanteId);
  return { comprobanteId, encolado: true };
}

/**
 * Cancela un documento aprobado en SIFEN (evento de cancelación, tipOpe 5).
 * Sólo aplica a comprobantes APROBADOS. En éxito marca el comprobante como
 * CANCELADO + ANULADO y registra un EventoSifen.
 */
export async function cancelar(ctx: DocCtx, comprobanteId: string, motivo: string) {
  const comp = await cargarComprobanteFiscal(ctx, comprobanteId);
  if (comp.estadoSifen !== EstadoSifen.APROBADO) {
    throw Errors.conflict('Sólo se cancelan comprobantes aprobados en SIFEN');
  }
  const cfg = await cargarCredenciales(comp.empresaId);
  const client = createCode100Client();
  const res = await client.cancelar(cfg.credentials, {
    dEst: comp.establecimiento,
    dPunExp: comp.puntoExpedicionCodigo,
    dNumDoc: String(comp.numero).padStart(7, '0'),
    mOtEve: motivo,
    tipoDoc: tipoDocAbrev(mapTipoDE(comp.tipoDocumento)),
  });

  const error = errorDeAlta(res);
  if (error) throw Errors.conflict(`SIFEN rechazó la cancelación: ${error}`);

  await prisma.$transaction([
    prisma.comprobante.update({
      where: { id: comp.id },
      data: {
        estadoSifen: EstadoSifen.CANCELADO,
        estado: EstadoComprobante.ANULADO,
        anuladoEn: new Date(),
        motivoAnulacion: motivo,
      },
    }),
    prisma.eventoSifen.create({
      data: {
        comprobanteId: comp.id,
        tipo: 'CANCELACION',
        estado: 'APROBADO',
        motivo,
        respondidoEn: new Date(),
      },
    }),
  ]);

  return {
    comprobanteId,
    estadoSifen: EstadoSifen.CANCELADO,
    aprobado: true,
    mensaje: 'Cancelado',
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
