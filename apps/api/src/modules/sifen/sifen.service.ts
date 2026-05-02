import {
  type CondicionVenta,
  EstadoComprobante,
  EstadoSifen,
  type Prisma,
  type Rol,
  type TasaIva,
  TipoContribuyente,
  TipoDocumentoFiscal,
} from '@prisma/client';
import {
  buildEventoCancelacionXml,
  type CondicionVentaSifen,
  type DocumentoElectronicoInput,
  type EmisorSifen,
  firmarXmlSifen,
  generarDocumentoElectronico,
  generarIdEvento,
  generarQrDesdeDocumento,
  type ItemDE,
  type ReceptorSifen,
  type TasaIvaSifen,
  type TipoContribuyente as TipoContribuyenteSifen,
  type TipoDocumentoSifen,
  type TipoOperacion,
} from '@smash/sifen-client';

import { logger } from '../../config/logger.js';
import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { getCert, getCsc, getSifenClient } from '../../lib/sifen.js';

/**
 * Servicio SIFEN: integra el cliente SIFEN con los comprobantes de la BD.
 *
 * Flujo `enviarComprobante`:
 *   1. Carga el comprobante con relaciones (items, cliente, sucursal, empresa, timbrado)
 *   2. Mapea a DocumentoElectronicoInput
 *   3. Genera CDC + XML pre-firma + QR placeholder
 *   4. Firma XAdES-BES con el cert
 *   5. Regenera el QR con el digest real
 *   6. Persiste cdc/xml_firmado/qr_url y deja estadoSifen=PENDIENTE
 *   7. Llama al cliente SIFEN (mock o real) y actualiza estado según respuesta
 *   8. Crea EventoSifen como auditoría del envío
 *
 * Flujo `cancelarComprobante`:
 *   1. Verifica que esté APROBADO (sólo se cancelan los aprobados)
 *   2. Construye XML de evento + firma
 *   3. Llama cancelarDe del cliente
 *   4. Si OK: marca comprobante.estadoSifen=CANCELADO y registra EventoSifen
 *
 * Tests usan `setSifenClientForTests` y `setCertForTests` desde lib/sifen.ts.
 */

interface UserCtx {
  userId: string;
  empresaId: string | null;
  rol: Rol;
  sucursalActivaId: string | null;
  isSuperAdmin: boolean;
}

const ROLES_GESTION: Rol[] = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN'];

// ───────────────────────────────────────────────────────────────────────────
//  ENVIAR
// ───────────────────────────────────────────────────────────────────────────

/**
 * Estados del campo `EventoSifen.estado` — string libre en el schema.
 * Convención centralizada acá para evitar typos.
 */
const EV_ENVIANDO = 'ENVIANDO'; // pre-llamada al cliente
const EV_APROBADO = 'APROBADO';
const EV_RECHAZADO = 'RECHAZADO';
const EV_ERROR_TRANSPORTE = 'ERROR_TRANSPORTE';

export async function enviarComprobante(user: UserCtx, comprobanteId: string) {
  const comp = await cargarComprobante(comprobanteId);
  if (!user.isSuperAdmin && comp.empresaId !== user.empresaId) throw Errors.tenantMismatch();

  if (comp.estado === EstadoComprobante.ANULADO) {
    throw Errors.conflict('No se puede enviar un comprobante anulado');
  }
  if (comp.estadoSifen === EstadoSifen.APROBADO) {
    throw Errors.conflict('Comprobante ya aprobado en SIFEN');
  }
  if (comp.estadoSifen === EstadoSifen.CANCELADO) {
    throw Errors.conflict('Comprobante cancelado en SIFEN');
  }
  if (comp.tipoDocumento === TipoDocumentoFiscal.TICKET) {
    throw Errors.conflict('Los tickets no se envían a SIFEN — son no fiscales');
  }

  // Idempotency guard: si ya hay un envío ENVIANDO huérfano (proceso muerto a mitad),
  // reconciliar via consultarDe en lugar de duplicar.
  if (comp.cdc && comp.estadoSifen === EstadoSifen.PENDIENTE) {
    const eventoHuerfano = await prisma.eventoSifen.findFirst({
      where: { comprobanteId: comp.id, tipo: 'ENVIO', estado: EV_ENVIANDO },
      orderBy: { enviadoEn: 'desc' },
    });
    if (eventoHuerfano) {
      logger.warn(
        { comprobanteId, cdc: comp.cdc },
        'EventoSifen ENVIANDO huérfano — reconciliando',
      );
      return reconciliarEnvio(comp.id, comp.cdc, eventoHuerfano.id);
    }
  }

  const csc = getCsc();
  const cert = getCert();

  const docInput = mapearComprobanteADocumento(comp);
  const docResult = generarDocumentoElectronico(docInput, csc);
  const firma = firmarXmlSifen({ xml: docResult.xml, cert });
  const qrUrl = generarQrDesdeDocumento(docResult.cdc, docInput, firma.digestValue, csc);

  // 1. Pre-persistir comprobante (cdc/xml/qr/PENDIENTE) + EventoSifen ENVIANDO
  //    en una sola transacción atómica. Esto sirve como "idempotency record":
  //    si el proceso muere antes de llamar al cliente o entre llamada y persist,
  //    el evento huérfano queda visible para reconciliación.
  const evento = await prisma.$transaction(async (tx) => {
    await tx.comprobante.update({
      where: { id: comp.id },
      data: {
        cdc: docResult.cdc,
        xmlFirmado: firma.xmlFirmado,
        qrUrl,
        estadoSifen: EstadoSifen.PENDIENTE,
        fechaEnvioSifen: new Date(),
        motivoRechazoSifen: null,
      },
    });
    return tx.eventoSifen.create({
      data: {
        comprobanteId: comp.id,
        tipo: 'ENVIO',
        estado: EV_ENVIANDO,
        xmlEnviado: firma.xmlFirmado,
      },
    });
  });

  // 2. Llamada HTTP — fuera de transacción para no bloquear la conexión.
  const client = getSifenClient();
  let respuesta;
  try {
    respuesta = await client.enviarDe({ xmlFirmado: firma.xmlFirmado, cdc: docResult.cdc });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ comprobanteId, err: msg }, 'SIFEN envío falló');
    await prisma.eventoSifen.update({
      where: { id: evento.id },
      data: {
        estado: EV_ERROR_TRANSPORTE,
        motivo: `Error de transporte: ${msg}`,
        respondidoEn: new Date(),
      },
    });
    // El comprobante queda PENDIENTE para reintento manual o reconciliación.
    throw Errors.conflict(`SIFEN no respondió: ${msg}`);
  }

  // 3. Persistir respuesta atómicamente: comprobante + evento del paso 1.
  const nuevoEstado = mapEstadoSifenRespuesta(respuesta.estado);
  await prisma.$transaction(async (tx) => {
    await tx.comprobante.update({
      where: { id: comp.id },
      data: {
        estadoSifen: nuevoEstado,
        fechaAprobacionSifen: nuevoEstado === EstadoSifen.APROBADO ? respuesta.fechaProceso : null,
        motivoRechazoSifen:
          nuevoEstado === EstadoSifen.RECHAZADO
            ? formatErroresMensaje(respuesta.mensaje, respuesta.errores)
            : null,
      },
    });
    await tx.eventoSifen.update({
      where: { id: evento.id },
      data: {
        estado: respuesta.estado === 'APROBADO' ? EV_APROBADO : EV_RECHAZADO,
        motivo: respuesta.mensaje,
        xmlRespuesta: respuesta.xmlRespuesta,
        respondidoEn: respuesta.fechaProceso,
      },
    });
  });

  // Audit log fuera de la transacción crítica (best-effort).
  void prisma.auditLog
    .create({
      data: {
        empresaId: comp.empresaId,
        sucursalId: comp.sucursalId,
        usuarioId: user.userId,
        accion: 'CREAR',
        entidad: 'EventoSifen',
        entidadId: comp.id,
        metadata: {
          operacion: 'ENVIAR_SIFEN',
          cdc: docResult.cdc,
          estado: respuesta.estado,
          protocolo: respuesta.protocolo ?? null,
        },
      },
    })
    .catch((err) => logger.warn({ err }, 'AuditLog ENVIAR_SIFEN falló'));

  return {
    comprobanteId: comp.id,
    cdc: docResult.cdc,
    estadoSifen: nuevoEstado,
    protocolo: respuesta.protocolo ?? null,
    mensaje: respuesta.mensaje,
    qrUrl,
  };
}

/**
 * Reconcilia un envío huérfano consultando a SIFEN por CDC.
 * Si el documento ya fue procesado por DNIT, persiste el resultado y resuelve.
 * Si todavía está PENDIENTE en DNIT, deja el evento como ENVIANDO para
 * que un próximo intento (o un job batch) lo reintente.
 */
async function reconciliarEnvio(
  comprobanteId: string,
  cdc: string,
  eventoId: string,
): Promise<{
  comprobanteId: string;
  cdc: string;
  estadoSifen: EstadoSifen;
  protocolo: string | null;
  mensaje: string;
  qrUrl: string | null;
}> {
  const client = getSifenClient();
  const respuesta = await client.consultarDe({ cdc });
  const nuevoEstado = mapEstadoSifenRespuesta(respuesta.estado);

  // Si DNIT todavía no procesó, mantenemos el evento ENVIANDO para futura reconciliación.
  if (nuevoEstado === EstadoSifen.PENDIENTE) {
    const c = await prisma.comprobante.findUniqueOrThrow({
      where: { id: comprobanteId },
      select: { qrUrl: true },
    });
    return {
      comprobanteId,
      cdc,
      estadoSifen: EstadoSifen.PENDIENTE,
      protocolo: respuesta.protocolo ?? null,
      mensaje: respuesta.mensaje,
      qrUrl: c.qrUrl,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.comprobante.update({
      where: { id: comprobanteId },
      data: {
        estadoSifen: nuevoEstado,
        fechaAprobacionSifen: nuevoEstado === EstadoSifen.APROBADO ? respuesta.fechaProceso : null,
        motivoRechazoSifen:
          nuevoEstado === EstadoSifen.RECHAZADO
            ? formatErroresMensaje(respuesta.mensaje, respuesta.errores)
            : null,
      },
    });
    await tx.eventoSifen.update({
      where: { id: eventoId },
      data: {
        estado: respuesta.estado === 'APROBADO' ? EV_APROBADO : EV_RECHAZADO,
        motivo: `[reconciliado] ${respuesta.mensaje}`,
        xmlRespuesta: respuesta.xmlRespuesta,
        respondidoEn: respuesta.fechaProceso,
      },
    });
  });

  const c = await prisma.comprobante.findUniqueOrThrow({
    where: { id: comprobanteId },
    select: { qrUrl: true },
  });

  return {
    comprobanteId,
    cdc,
    estadoSifen: nuevoEstado,
    protocolo: respuesta.protocolo ?? null,
    mensaje: respuesta.mensaje,
    qrUrl: c.qrUrl,
  };
}

// ───────────────────────────────────────────────────────────────────────────
//  CANCELAR
// ───────────────────────────────────────────────────────────────────────────

export async function cancelarComprobante(user: UserCtx, comprobanteId: string, motivo: string) {
  const comp = await cargarComprobante(comprobanteId);
  if (!user.isSuperAdmin && comp.empresaId !== user.empresaId) throw Errors.tenantMismatch();
  const esEmisor = comp.emitidoPorId === user.userId;
  if (!esEmisor && !ROLES_GESTION.includes(user.rol)) {
    throw Errors.forbidden('Sólo el emisor o un gerente pueden cancelar en SIFEN');
  }
  if (!comp.cdc) throw Errors.conflict('Comprobante no tiene CDC — no fue enviado a SIFEN');
  if (comp.estadoSifen !== EstadoSifen.APROBADO) {
    throw Errors.conflict('Sólo se cancelan comprobantes aprobados en SIFEN');
  }

  const cert = getCert();

  const idEvento = generarIdEvento(comp.cdc, 1);
  const xmlEvento = buildEventoCancelacionXml({
    cdc: comp.cdc,
    motivo,
    idEvento,
  });

  // El XML del evento se firma igual que el DE — con el cert.
  // Pero firmarXmlSifen busca <DE Id="...">; el evento usa <rEv><rEve Id="...">.
  // Por simplicidad, en este checkpoint no firmamos eventos (el cliente real
  // del Fase 4-prod lo hará). El mock acepta el XML sin firma.
  // TODO Fase 4-prod: extender firmarXmlSifen para soportar nodo <rEve>.
  void cert; // referenciado para que el lint no remueva el require

  // Pre-persistir EventoSifen ENVIANDO antes de la llamada HTTP (idempotency record).
  const evento = await prisma.eventoSifen.create({
    data: {
      comprobanteId: comp.id,
      tipo: 'CANCELACION',
      estado: EV_ENVIANDO,
      motivo,
      xmlEnviado: xmlEvento,
    },
  });

  const client = getSifenClient();
  let respuesta;
  try {
    respuesta = await client.cancelarDe({ cdc: comp.cdc, motivo, xmlEvento });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ comprobanteId, err: msg }, 'SIFEN cancelación falló');
    await prisma.eventoSifen.update({
      where: { id: evento.id },
      data: {
        estado: EV_ERROR_TRANSPORTE,
        motivo: `${motivo} | Error de transporte: ${msg}`,
        respondidoEn: new Date(),
      },
    });
    throw Errors.conflict(`SIFEN no respondió: ${msg}`);
  }

  const exitoso = respuesta.estado === 'CANCELADO';

  // Persistir respuesta + (si exitoso) actualizar comprobante atómicamente.
  await prisma.$transaction(async (tx) => {
    if (exitoso) {
      await tx.comprobante.update({
        where: { id: comp.id },
        data: {
          estadoSifen: EstadoSifen.CANCELADO,
          estado: EstadoComprobante.ANULADO,
          anuladoEn: new Date(),
          motivoAnulacion: motivo,
        },
      });
    }
    await tx.eventoSifen.update({
      where: { id: evento.id },
      data: {
        estado: exitoso ? EV_APROBADO : EV_RECHAZADO,
        xmlRespuesta: respuesta.xmlRespuesta,
        respondidoEn: respuesta.fechaProceso,
      },
    });
  });

  // Audit log fuera de la transacción crítica (best-effort).
  void prisma.auditLog
    .create({
      data: {
        empresaId: comp.empresaId,
        sucursalId: comp.sucursalId,
        usuarioId: user.userId,
        accion: 'ANULAR_COMPROBANTE',
        entidad: 'EventoSifen',
        entidadId: comp.id,
        metadata: {
          operacion: 'CANCELAR_SIFEN',
          cdc: comp.cdc,
          motivo,
          estado: respuesta.estado,
        },
      },
    })
    .catch((err) => logger.warn({ err }, 'AuditLog CANCELAR_SIFEN falló'));

  return {
    comprobanteId: comp.id,
    estadoSifen: exitoso ? EstadoSifen.CANCELADO : comp.estadoSifen,
    mensaje: respuesta.mensaje,
    aprobado: exitoso,
  };
}

// ───────────────────────────────────────────────────────────────────────────
//  CONSULTAR
// ───────────────────────────────────────────────────────────────────────────

export async function consultarEstado(user: UserCtx, comprobanteId: string) {
  const comp = await cargarComprobante(comprobanteId);
  if (!user.isSuperAdmin && comp.empresaId !== user.empresaId) throw Errors.tenantMismatch();
  if (!comp.cdc) throw Errors.conflict('Comprobante no tiene CDC');

  const client = getSifenClient();
  const respuesta = await client.consultarDe({ cdc: comp.cdc });

  return {
    comprobanteId: comp.id,
    cdc: comp.cdc,
    estadoLocal: comp.estadoSifen,
    estadoSifen: respuesta.estado,
    protocolo: respuesta.protocolo ?? null,
    mensaje: respuesta.mensaje,
    procesado: respuesta.procesado,
  };
}

// ───────────────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────────────

const COMP_INCLUDE = {
  items: true,
  pagos: true,
  cliente: true,
  empresa: true,
  sucursal: true,
  puntoExpedicion: true,
  timbrado: true,
} satisfies Prisma.ComprobanteInclude;

type ComprobanteCompleto = Prisma.ComprobanteGetPayload<{ include: typeof COMP_INCLUDE }>;

async function cargarComprobante(id: string): Promise<ComprobanteCompleto> {
  const c = await prisma.comprobante.findUnique({ where: { id }, include: COMP_INCLUDE });
  if (!c) throw Errors.notFound('Comprobante no encontrado');
  return c;
}

function mapearComprobanteADocumento(comp: ComprobanteCompleto): DocumentoElectronicoInput {
  const tipoSifen = mapTipoDocumento(comp.tipoDocumento);
  const tipoOperacion = inferirTipoOperacion(comp);

  const emisor: EmisorSifen = {
    ruc: comp.empresa.ruc,
    dv: comp.empresa.dv,
    razonSocial: comp.empresa.razonSocial,
    nombreFantasia: comp.empresa.nombreFantasia,
    direccion: comp.empresa.direccion ?? comp.sucursal.direccion ?? 'Asunción',
    ciudad: comp.sucursal.ciudad ?? 'Asunción',
    departamento: comp.sucursal.departamento ?? undefined,
    telefono: comp.empresa.telefono ?? undefined,
    email: comp.empresa.email ?? undefined,
    tipoContribuyente: 2, // PJ por default — TODO: mover a configuración empresa
    establecimiento: comp.establecimiento,
    puntoExpedicion: comp.puntoExpedicionCodigo,
  };

  const receptor: ReceptorSifen = {
    tipoOperacion,
    ruc: comp.receptorRuc ?? undefined,
    dv: comp.receptorDv ?? undefined,
    tipoContribuyente: mapTipoContribuyente(comp.receptorTipoContribuyente),
    documento: comp.receptorDocumento ?? undefined,
    tipoDocumento: comp.receptorDocumento ? 1 : undefined, // 1=CI
    razonSocial: comp.receptorRazonSocial,
    email: comp.receptorEmail ?? undefined,
    pais: 'PRY',
  };

  const items: ItemDE[] = comp.items.map((it) => ({
    codigo: it.codigo ?? it.id,
    descripcion: it.descripcion,
    unidadMedida: 77, // 77 = Unidad SIFEN
    cantidad: it.cantidad,
    precioUnitario: it.precioUnitario,
    descuento: it.descuentoUnitario > 0n ? it.descuentoUnitario : undefined,
    tasaIva: mapTasaIva(it.tasaIva),
  }));

  const condicionPago = comp.pagos.map((p) => ({
    metodo: mapMetodoPago(p.metodo),
    monto: p.monto,
    moneda: 'PYG',
  }));

  return {
    tipoDocumento: tipoSifen,
    numeroDocumento: comp.numero,
    fechaEmision: comp.fechaEmision,
    tipoEmision: 1,
    codigoSeguridad: '', // se autogenera dentro de generarDocumentoElectronico
    tipoTransaccion: 1,
    condicionVenta: mapCondicionVenta(comp.condicionVenta),
    tipoOperacion,
    indicadorPresencia: 1,
    moneda: 'PYG',
    emisor,
    receptor,
    items,
    condicionPago,
  };
}

function mapTipoDocumento(t: TipoDocumentoFiscal): TipoDocumentoSifen {
  switch (t) {
    case TipoDocumentoFiscal.FACTURA:
      return 1;
    case TipoDocumentoFiscal.AUTOFACTURA:
      return 4;
    case TipoDocumentoFiscal.NOTA_CREDITO:
      return 5;
    case TipoDocumentoFiscal.NOTA_DEBITO:
      return 6;
    case TipoDocumentoFiscal.NOTA_REMISION:
      return 7;
    case TipoDocumentoFiscal.TICKET:
    default:
      throw Errors.conflict(`tipoDocumento ${t} no es soportado por SIFEN`);
  }
}

function mapTipoContribuyente(t: TipoContribuyente): TipoContribuyenteSifen | undefined {
  switch (t) {
    case TipoContribuyente.PERSONA_FISICA:
    case TipoContribuyente.CONSUMIDOR_FINAL:
    case TipoContribuyente.EXTRANJERO:
      return 1;
    case TipoContribuyente.PERSONA_JURIDICA:
      return 2;
    default:
      return undefined;
  }
}

function inferirTipoOperacion(comp: ComprobanteCompleto): TipoOperacion {
  if (comp.receptorTipoContribuyente === TipoContribuyente.EXTRANJERO) return 4;
  if (comp.receptorRuc) return 1; // B2B
  return 2; // B2C consumidor final
}

function mapTasaIva(t: TasaIva): TasaIvaSifen {
  switch (t) {
    case 'IVA_10':
      return 10;
    case 'IVA_5':
      return 5;
    case 'IVA_0':
    case 'EXENTO':
    default:
      return 0;
  }
}

function mapCondicionVenta(c: CondicionVenta): CondicionVentaSifen {
  return c === 'CONTADO' ? 1 : 2;
}

function mapMetodoPago(m: string): number {
  // Códigos DNIT: 1 Efectivo, 2 Cheque, 3 TC, 4 TD, 5 Transf, 19 Pago electrónico
  switch (m) {
    case 'EFECTIVO':
      return 1;
    case 'CHEQUE':
      return 2;
    case 'TARJETA_CREDITO':
      return 3;
    case 'TARJETA_DEBITO':
      return 4;
    case 'TRANSFERENCIA':
      return 5;
    case 'BANCARD':
    case 'INFONET':
    case 'ZIMPLE':
    case 'TIGO_MONEY':
    case 'PERSONAL_PAY':
      return 19;
    default:
      return 99;
  }
}

function mapEstadoSifenRespuesta(estado: string): EstadoSifen {
  switch (estado) {
    case 'APROBADO':
    case 'APROBADO_CON_OBS':
      return EstadoSifen.APROBADO;
    case 'RECHAZADO':
      return EstadoSifen.RECHAZADO;
    case 'PENDIENTE':
      return EstadoSifen.PENDIENTE;
    case 'CANCELADO':
      return EstadoSifen.CANCELADO;
    case 'INUTILIZADO':
      return EstadoSifen.INUTILIZADO;
    default:
      return EstadoSifen.PENDIENTE;
  }
}

function formatErroresMensaje(
  base: string,
  errores?: { codigo: string; mensaje: string }[],
): string {
  if (!errores || errores.length === 0) return base;
  return `${base} | ${errores.map((e) => `[${e.codigo}] ${e.mensaje}`).join('; ')}`;
}
