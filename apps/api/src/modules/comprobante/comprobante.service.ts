import {
  EstadoComprobante,
  EstadoMesa,
  EstadoPedido,
  MetodoPago,
  Prisma,
  type Rol,
  TasaIva,
  TipoDocumentoFiscal,
  TipoMovimientoCaja,
  TipoPedido,
} from '@prisma/client';

import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { emitPedido } from '../../lib/socketio.js';
import { dispararEmision } from '../facturacion/facturacion-runner.js';
import { calcularCostoInsumoDirecto, calcularCostoUnitario } from '../pedido/calcular-costo.js';
import {
  aplicarCancelacionInline,
  aplicarConfirmacionInline,
  obtenerPedidoParaKds,
  PEDIDO_INCLUDE_PARA_CONFIRMAR,
} from '../pedido/pedido.service.js';

import type {
  AnularComprobanteInput,
  EmitirComprobanteInput,
  EmitirNotaCreditoInput,
  ListarComprobantesQuery,
} from './comprobante.schemas.js';

/**
 * Servicio de comprobantes.
 *
 * Reglas:
 *  - Sólo se emite desde un pedido ENTREGADO o CONFIRMADO+ (no facturado todavía)
 *  - El usuario debe tener apertura de caja activa para que la venta se asocie
 *  - Numeración fiscal correlativa por (timbrado, tipoDocumento)
 *  - Snapshot completo de receptor + items en el comprobante (no FK al producto,
 *    porque el producto puede borrarse después)
 *  - Pagos pueden ser múltiples (parte efectivo + parte tarjeta, etc.)
 *  - El total de los pagos debe igualar el total del comprobante (estricto)
 *  - Cada pago genera un MovimientoCaja tipo VENTA
 *  - Pedido pasa a FACTURADO al emitir
 *  - Anulación: marca como ANULADO; reverso de movimientos de caja
 *
 * Schema preparado para SIFEN — los campos cdc, xml_firmado, qr_url, estado_sifen
 * quedan NULL hasta integración de Fase 4.
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
//  EMITIR
// ───────────────────────────────────────────────────────────────────────────

export async function emitirComprobante(user: UserCtx, input: EmitirComprobanteInput) {
  if (!user.empresaId) throw Errors.forbidden('Usuario sin empresa');
  if (!user.sucursalActivaId) throw Errors.forbidden('Seleccioná una sucursal activa');
  const empresaId = user.empresaId;

  // Apertura de caja activa del usuario (donde se va a asociar la venta)
  const apertura = await prisma.aperturaCaja.findFirst({
    where: { usuarioId: user.userId, cierre: null },
    include: { caja: { select: { id: true, sucursalId: true, puntoExpedicionId: true } } },
  });
  if (!apertura) {
    throw Errors.conflict('Necesitás tener una caja abierta para emitir comprobantes');
  }
  if (apertura.caja.sucursalId !== user.sucursalActivaId) {
    throw Errors.tenantMismatch();
  }

  // Pedido a facturar
  const pedido = await prisma.pedido.findUnique({
    where: { id: input.pedidoId },
    include: {
      items: {
        include: {
          productoVenta: { select: { id: true, nombre: true, codigo: true, tasaIva: true } },
          modificadores: {
            include: {
              modificadorOpcion: {
                select: {
                  nombre: true,
                  productoVentaId: true,
                  productoInventarioId: true,
                  cantidadInventario: true,
                },
              },
            },
          },
          combosOpcion: {
            include: {
              comboGrupo: { select: { nombre: true } },
              comboGrupoOpcion: {
                include: { productoVenta: { select: { nombre: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!pedido) throw Errors.notFound('Pedido no encontrado');
  if (pedido.empresaId !== user.empresaId) throw Errors.tenantMismatch();
  if (pedido.sucursalId !== user.sucursalActivaId) throw Errors.sucursalNoAutorizada();
  if (pedido.estado === EstadoPedido.CANCELADO) {
    throw Errors.conflict('No se puede facturar un pedido cancelado');
  }
  // El nº de pager es obligatorio sólo para pedidos que esperan en el local y
  // se llaman cuando están listos (mostrador / retiro). Delivery y mesa no lo
  // usan, así que ahí queda opcional.
  const requierePager =
    pedido.tipo === TipoPedido.MOSTRADOR || pedido.tipo === TipoPedido.RETIRO_LOCAL;
  if (requierePager && input.numeroPager === undefined) {
    throw Errors.validation({ numeroPager: 'El número de pager es obligatorio' });
  }
  // ¿Ya hay un comprobante EMITIDO para este pedido? Bloquea doble emisión sin
  // depender del estado del pedido (que ahora puede ser CONFIRMADO post-cobro).
  const yaTieneComprobante =
    (await prisma.comprobante.count({
      where: { pedidoId: pedido.id, estado: EstadoComprobante.EMITIDO, deletedAt: null },
    })) > 0;
  if (yaTieneComprobante) {
    throw Errors.conflict('El pedido ya tiene un comprobante emitido');
  }

  // Resolver cliente: si no se pasa, usar consumidor final de la empresa
  const clienteId = input.clienteId ?? pedido.clienteId;
  const cliente = await resolverCliente(user.empresaId, clienteId);

  // TICKET sólo para consumidor final (regla SET; relajado para FACTURA)
  if (input.tipoDocumento === TipoDocumentoFiscal.TICKET && !cliente.esConsumidorFinal) {
    // Nota: la regla real depende del régimen fiscal. Lo permitimos pero advertimos.
  }

  // Validar suma de pagos = total del pedido
  const totalPagos = input.pagos.reduce((acc, p) => acc + p.monto, 0n);
  if (totalPagos !== pedido.total) {
    throw Errors.validation({
      pagos: `La suma de pagos (${totalPagos}) debe igualar el total del pedido (${pedido.total})`,
    });
  }

  // Resolver timbrado activo para el punto de expedición de la caja
  if (!apertura.caja.puntoExpedicionId) {
    throw Errors.conflict('La caja no tiene punto de expedición asignado');
  }
  const puntoExpedicionId = apertura.caja.puntoExpedicionId;

  // Calcular subtotales discriminados por tasa de IVA
  const totales = calcularTotalesComprobante(pedido.items);

  // Estado original del pedido — define el estado final post-emisión:
  //  PENDIENTE → CONFIRMADO (fast-food: cobrar primero, recién ahora va a cocina)
  //  ENTREGADO / EN_CAMINO → FACTURADO (flujo MESA: ya se entregó, cierra el ciclo)
  //  CONFIRMADO / EN_PREP / LISTO → no se toca (caso atípico: cobrar a mitad del servicio)
  const estadoOriginal = pedido.estado;
  const estadoFinal =
    estadoOriginal === EstadoPedido.PENDIENTE
      ? EstadoPedido.CONFIRMADO
      : estadoOriginal === EstadoPedido.ENTREGADO || estadoOriginal === EstadoPedido.EN_CAMINO
        ? EstadoPedido.FACTURADO
        : estadoOriginal;

  // Transacción: numerar + crear comprobante + items + pagos + movimientos de caja + actualizar pedido
  let intento = 0;
  while (true) {
    intento += 1;
    try {
      const comprobanteCreado = await prisma.$transaction(async (tx) => {
        // Lock + increment del timbrado (atomic)
        const timbrado = await tx.timbrado.findFirst({
          where: {
            puntoExpedicionId,
            tipoDocumento: input.tipoDocumento,
            activo: true,
            fechaInicioVigencia: { lte: new Date() },
            fechaFinVigencia: { gte: new Date() },
          },
          include: {
            puntoExpedicion: {
              include: { sucursal: { select: { establecimiento: true } } },
            },
          },
        });
        if (!timbrado) {
          throw Errors.conflict(
            `No hay timbrado activo de ${input.tipoDocumento} para este punto de expedición`,
          );
        }

        const siguiente = timbrado.ultimoNumeroUsado + 1;
        if (siguiente > timbrado.rangoHasta) {
          throw Errors.conflict('Timbrado agotado — solicitá uno nuevo');
        }

        // Increment con check de versión
        const updateRes = await tx.timbrado.updateMany({
          where: { id: timbrado.id, ultimoNumeroUsado: timbrado.ultimoNumeroUsado },
          data: { ultimoNumeroUsado: siguiente },
        });
        if (updateRes.count === 0) {
          // race — reintentar
          throw new Prisma.PrismaClientKnownRequestError('numeracion race', {
            code: 'P2002',
            clientVersion: 'unknown',
          });
        }

        const establecimiento = timbrado.puntoExpedicion.sucursal.establecimiento;
        // Una sucursal sin establecimiento es un depósito (no factura). No
        // debería llegar acá nunca —no tiene cajas ni puntos de expedición—,
        // pero el campo es nullable a nivel schema, así que lo cerramos.
        if (!establecimiento) {
          throw Errors.conflict('La sucursal no tiene establecimiento SIFEN: no puede facturar');
        }
        const ptoExpCodigo = timbrado.puntoExpedicion.codigo;
        const numeroDocumento = `${establecimiento}-${ptoExpCodigo}-${String(siguiente).padStart(7, '0')}`;

        // Crear comprobante
        const comprobante = await tx.comprobante.create({
          data: {
            empresaId,
            sucursalId: pedido.sucursalId,
            puntoExpedicionId,
            timbradoId: timbrado.id,
            cajaId: apertura.cajaId,
            aperturaCajaId: apertura.id,
            pedidoId: pedido.id,
            clienteId: cliente.id,
            emitidoPorId: user.userId,
            tipoDocumento: input.tipoDocumento,
            establecimiento,
            puntoExpedicionCodigo: ptoExpCodigo,
            numero: siguiente,
            numeroDocumento,
            fechaEmision: new Date(),
            condicionVenta: input.condicionVenta,
            estado: EstadoComprobante.EMITIDO,
            // Snapshot del receptor
            receptorTipoContribuyente: cliente.tipoContribuyente,
            receptorRuc: cliente.ruc,
            receptorDv: cliente.dv,
            receptorDocumento: cliente.documento,
            receptorRazonSocial: cliente.razonSocial,
            receptorEmail: cliente.email,
            // Totales
            subtotalExentas: totales.subtotalExentas,
            subtotalIva5: totales.subtotalIva5,
            subtotalIva10: totales.subtotalIva10,
            totalIva5: totales.totalIva5,
            totalIva10: totales.totalIva10,
            // Snapshot del descuento global y recargo del pedido — el mapper SIFEN
            // los prorratea/agrega para que el DE reconcilie con `total`.
            totalDescuento: pedido.totalDescuento,
            recargoDelivery: pedido.recargoDelivery,
            total: pedido.total,
            // Items snapshot
            items: {
              create: await Promise.all(
                pedido.items.map(async (it) => ({
                  productoVentaId: it.productoVentaId,
                  codigo: it.productoVenta.codigo,
                  descripcion: armarDescripcionItem(it),
                  cantidad: it.cantidad,
                  precioUnitario: it.precioUnitario + it.precioModificadores,
                  tasaIva: it.productoVenta.tasaIva,
                  subtotal: it.subtotal,
                  costoUnitarioSnapshot: await calcularCostoUnitarioItem(tx, it, pedido.sucursalId),
                })),
              ),
            },
            // Pagos
            pagos: {
              create: input.pagos.map((p) => ({
                metodo: p.metodo,
                monto: p.monto,
                referencia: p.referencia,
              })),
            },
          },
          include: {
            items: true,
            pagos: true,
            cliente: { select: { id: true, razonSocial: true, ruc: true, dv: true } },
          },
        });

        // Movimientos de caja (uno por pago) tipo VENTA
        for (const pago of input.pagos) {
          await tx.movimientoCaja.create({
            data: {
              cajaId: apertura.cajaId,
              aperturaCajaId: apertura.id,
              tipo: TipoMovimientoCaja.VENTA,
              metodoPago: pago.metodo,
              monto: pago.monto,
              concepto: `Venta ${numeroDocumento}`,
              comprobanteId: comprobante.id,
            },
          });
        }

        // Si el pedido estaba PENDIENTE, hay que descontar stock y marcarlo
        // CONFIRMADO antes de emitir. Esto es el flujo fast-food: el cliente
        // paga primero y recién después la cocina ve el pedido.
        if (estadoOriginal === EstadoPedido.PENDIENTE) {
          const pedidoParaConfirmar = await tx.pedido.findUniqueOrThrow({
            where: { id: pedido.id },
            include: PEDIDO_INCLUDE_PARA_CONFIRMAR,
          });
          await aplicarConfirmacionInline(tx, user, pedidoParaConfirmar);
        }

        // Avanzar pedido al estado final calculado arriba + setear pager si vino.
        // Sólo updateamos el campo estado si efectivamente cambia, así no
        // pisamos el CONFIRMADO recién aplicado por aplicarConfirmacionInline.
        const datosFinales: Prisma.PedidoUpdateInput = {};
        if (input.numeroPager !== undefined) datosFinales.numeroPager = input.numeroPager;
        if (estadoFinal !== EstadoPedido.CONFIRMADO || estadoOriginal !== EstadoPedido.PENDIENTE) {
          if (estadoFinal !== estadoOriginal) datosFinales.estado = estadoFinal;
        }
        if (Object.keys(datosFinales).length > 0) {
          await tx.pedido.update({ where: { id: pedido.id }, data: datosFinales });
        }

        // Liberar mesa sólo si el ciclo se cerró (FACTURADO). En fast-food
        // (PENDIENTE → CONFIRMADO) la mesa no aplica; en MESA estado original
        // ya es ENTREGADO al momento del cobro.
        if (
          estadoFinal === EstadoPedido.FACTURADO &&
          pedido.tipo === TipoPedido.MESA &&
          pedido.mesaId
        ) {
          await tx.mesa.update({
            where: { id: pedido.mesaId },
            data: { estado: EstadoMesa.LIBRE },
          });
        }

        await tx.auditLog.create({
          data: {
            empresaId: user.empresaId,
            sucursalId: pedido.sucursalId,
            usuarioId: user.userId,
            accion: 'CREAR',
            entidad: 'Comprobante',
            entidadId: comprobante.id,
            metadata: {
              tipoDocumento: input.tipoDocumento,
              numero: numeroDocumento,
              total: pedido.total.toString(),
              metodos: input.pagos.map((p) => p.metodo),
            },
          },
        });

        return comprobante;
      });

      // Post-tx: si confirmamos inline (PENDIENTE → CONFIRMADO), avisar al KDS
      // por socket para que la cocina vea el pedido al instante.
      if (estadoOriginal === EstadoPedido.PENDIENTE) {
        const completo = await obtenerPedidoParaKds(pedido.id);
        if (completo) emitPedido('pedido.confirmado', completo.sucursalId, completo);
      }

      // Post-tx: disparar emisión a SIFEN en segundo plano si es un documento
      // fiscal (no TICKET). Fire-and-forget: no bloquea la respuesta y, si algo
      // falla, el barrido de reconciliación lo recupera.
      if (comprobanteCreado.tipoDocumento !== TipoDocumentoFiscal.TICKET) {
        dispararEmision(comprobanteCreado.id);
      }

      return comprobanteCreado;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        intento < 5
      ) {
        // Race en la numeración — reintentar
        continue;
      }
      throw err;
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  ANULAR
// ───────────────────────────────────────────────────────────────────────────

export async function anularComprobante(
  user: UserCtx,
  comprobanteId: string,
  input: AnularComprobanteInput,
) {
  return prisma
    .$transaction(async (tx) => {
      const comprobante = await tx.comprobante.findUnique({
        where: { id: comprobanteId },
        include: { pagos: true, movimientosCaja: true },
      });
      if (!comprobante) throw Errors.notFound('Comprobante no encontrado');
      if (!user.isSuperAdmin && comprobante.empresaId !== user.empresaId) {
        throw Errors.tenantMismatch();
      }
      if (comprobante.estado === EstadoComprobante.ANULADO) {
        throw Errors.conflict('Ya está anulado');
      }
      // Sólo el emisor o roles de gestión
      const esEmisor = comprobante.emitidoPorId === user.userId;
      if (!esEmisor && !ROLES_GESTION.includes(user.rol)) {
        throw Errors.forbidden('Sólo el emisor o un gerente pueden anular');
      }

      const actualizado = await tx.comprobante.update({
        where: { id: comprobanteId },
        data: {
          estado: EstadoComprobante.ANULADO,
          anuladoEn: new Date(),
          motivoAnulacion: input.motivo,
        },
      });

      // Reverso de movimientos de caja: si la caja todavía está abierta, eliminamos los movs
      // VENTA. Si ya cerró, no tocamos (el cierre Z ya quedó histórico — la anulación queda
      // como evento separado).
      for (const mov of comprobante.movimientosCaja) {
        if (mov.aperturaCajaId) {
          const apertura = await tx.aperturaCaja.findUnique({
            where: { id: mov.aperturaCajaId },
            include: { cierre: true },
          });
          if (apertura && !apertura.cierre) {
            await tx.movimientoCaja.delete({ where: { id: mov.id } });
          }
        }
      }

      // Si el pedido todavía no se entregó al cliente (cocina aún no sacó la
      // comida o se está preparando), cancelamos el pedido y revertimos stock.
      // Si ya se entregó, anular = solo evento fiscal (devolución contable).
      let pedidoCanceladoId: string | null = null;
      let pedidoCanceladoSucursalId: string | null = null;
      if (comprobante.pedidoId) {
        const pedido = await tx.pedido.findUnique({ where: { id: comprobante.pedidoId } });
        if (
          pedido &&
          pedido.estado !== EstadoPedido.CANCELADO &&
          pedido.estado !== EstadoPedido.FACTURADO &&
          !pedido.entregadoEn
        ) {
          await aplicarCancelacionInline(
            tx,
            user,
            pedido,
            `Anulación comprobante ${comprobante.numeroDocumento}: ${input.motivo}`,
          );
          pedidoCanceladoId = pedido.id;
          pedidoCanceladoSucursalId = pedido.sucursalId;
        }
      }

      await tx.auditLog.create({
        data: {
          empresaId: comprobante.empresaId,
          sucursalId: comprobante.sucursalId,
          usuarioId: user.userId,
          accion: 'ANULAR_COMPROBANTE',
          entidad: 'Comprobante',
          entidadId: comprobante.id,
          metadata: {
            numero: comprobante.numeroDocumento,
            motivo: input.motivo,
            pedidoCancelado: pedidoCanceladoId,
          },
        },
      });

      return { actualizado, pedidoCanceladoId, pedidoCanceladoSucursalId };
    })
    .then(({ actualizado, pedidoCanceladoId, pedidoCanceladoSucursalId }) => {
      if (pedidoCanceladoId && pedidoCanceladoSucursalId) {
        emitPedido('pedido.cancelado', pedidoCanceladoSucursalId, {
          id: pedidoCanceladoId,
          numero: 0, // el resolver del client refetcheará — el id es lo que importa
        });
      }
      return actualizado;
    });
}

// ───────────────────────────────────────────────────────────────────────────
//  NOTA DE CRÉDITO PARCIAL — acredita items puntuales de un comprobante emitido
// ───────────────────────────────────────────────────────────────────────────

/**
 * Emite una nota de crédito por un subconjunto de items de un comprobante ya
 * emitido (devolución / cancelación de items post-factura). Solo gerente/admin.
 *
 *  - Numera contra un timbrado de NOTA_CREDITO del mismo punto de expedición que
 *    el original (numeración fiscal independiente por tipo de documento).
 *  - Snapshot de receptor y de los items acreditados (precio/descr/tasa) tomados
 *    del original; el subtotal se prorratea por cantidad para respetar descuentos.
 *  - Controla no acreditar más de lo vendido, sumando NCs previas del mismo
 *    original (agrupando por producto+precio+descripción+tasa, sin FK item→item).
 *  - Si hay caja abierta y `registrarEgresoCaja`, registra el EGRESO del dinero.
 *  - NO revierte stock (la mercadería ya se entregó: la NC es el ajuste fiscal).
 *  - Dispara la emisión a SIFEN en segundo plano (la NC es documento fiscal).
 */
export async function emitirNotaCreditoParcial(
  user: UserCtx,
  comprobanteOriginalId: string,
  input: EmitirNotaCreditoInput,
) {
  if (!user.empresaId) throw Errors.forbidden('Usuario sin empresa');
  const empresaId = user.empresaId;
  if (!user.isSuperAdmin && !ROLES_GESTION.includes(user.rol)) {
    throw Errors.forbidden('Solo un gerente o admin puede emitir notas de crédito');
  }

  const original = await prisma.comprobante.findUnique({
    where: { id: comprobanteOriginalId },
    include: { items: true },
  });
  if (!original) throw Errors.notFound('Comprobante no encontrado');
  if (!user.isSuperAdmin && original.empresaId !== user.empresaId) throw Errors.tenantMismatch();
  if (original.estado !== EstadoComprobante.EMITIDO) {
    throw Errors.conflict('Solo se puede acreditar un comprobante EMITIDO');
  }
  if (
    original.tipoDocumento === TipoDocumentoFiscal.NOTA_CREDITO ||
    original.comprobanteOriginalId
  ) {
    throw Errors.conflict('No se puede emitir una nota de crédito sobre otra nota');
  }
  if (!original.establecimiento) {
    throw Errors.conflict('El comprobante original no tiene establecimiento SIFEN');
  }

  // Clave de agrupación de items: sin FK item→item, agrupamos por la identidad
  // del snapshot (producto + precio + descripción + tasa) para acumular cantidades.
  const claveItem = (it: {
    productoVentaId: string | null;
    precioUnitario: bigint;
    descripcion: string;
    tasaIva: TasaIva;
  }) => `${it.productoVentaId ?? ''}|${it.precioUnitario}|${it.descripcion}|${it.tasaIva}`;

  const itemMap = new Map(original.items.map((it) => [it.id, it]));
  const vendidoPorClave = new Map<string, number>();
  for (const it of original.items) {
    vendidoPorClave.set(claveItem(it), (vendidoPorClave.get(claveItem(it)) ?? 0) + it.cantidad);
  }

  // Notas de crédito previas no anuladas sobre este original → ya acreditado.
  const notasPrevias = await prisma.comprobante.findMany({
    where: {
      comprobanteOriginalId: original.id,
      tipoDocumento: TipoDocumentoFiscal.NOTA_CREDITO,
      estado: { not: EstadoComprobante.ANULADO },
      deletedAt: null,
    },
    include: { items: true },
  });
  const acreditadoPorClave = new Map<string, number>();
  for (const nc of notasPrevias) {
    for (const it of nc.items) {
      acreditadoPorClave.set(
        claveItem(it),
        (acreditadoPorClave.get(claveItem(it)) ?? 0) + it.cantidad,
      );
    }
  }

  // Construir los items de la NC y acumular lo solicitado por clave.
  const solicitadoPorClave = new Map<string, number>();
  const itemsNc: {
    productoVentaId: string | null;
    codigo: string | null;
    descripcion: string;
    cantidad: number;
    precioUnitario: bigint;
    tasaIva: TasaIva;
    subtotal: bigint;
    costoUnitarioSnapshot: bigint;
  }[] = [];
  for (const sel of input.items) {
    const orig = itemMap.get(sel.itemComprobanteId);
    if (!orig) {
      throw Errors.validation({
        items: `Item ${sel.itemComprobanteId} no pertenece al comprobante`,
      });
    }
    if (sel.cantidad > orig.cantidad) {
      throw Errors.validation({
        items: `Cantidad ${sel.cantidad} supera la facturada (${orig.cantidad})`,
      });
    }
    const clave = claveItem(orig);
    solicitadoPorClave.set(clave, (solicitadoPorClave.get(clave) ?? 0) + sel.cantidad);

    // Prorrateo del subtotal (IVA-incluido) por la cantidad acreditada, para
    // respetar descuentos/NXM aplicados en la línea original.
    const subtotalNc = roundDiv(orig.subtotal * BigInt(sel.cantidad), BigInt(orig.cantidad));
    itemsNc.push({
      productoVentaId: orig.productoVentaId,
      codigo: orig.codigo,
      descripcion: orig.descripcion,
      cantidad: sel.cantidad,
      precioUnitario: orig.precioUnitario,
      tasaIva: orig.tasaIva,
      subtotal: subtotalNc,
      costoUnitarioSnapshot: orig.costoUnitarioSnapshot,
    });
  }

  // No acreditar más de lo vendido (acumulado entre todas las NCs del original).
  for (const [clave, solicitado] of solicitadoPorClave) {
    const disponible = (vendidoPorClave.get(clave) ?? 0) - (acreditadoPorClave.get(clave) ?? 0);
    if (solicitado > disponible) {
      throw Errors.conflict(
        `Cantidad a acreditar supera lo disponible (vendido ${vendidoPorClave.get(clave) ?? 0}, ya acreditado ${acreditadoPorClave.get(clave) ?? 0})`,
      );
    }
  }

  const totales = discriminarIva(
    itemsNc.map((it) => ({ subtotal: it.subtotal, tasaIva: it.tasaIva })),
  );
  const totalNc = itemsNc.reduce((acc, it) => acc + it.subtotal, 0n);

  // Caja abierta del usuario para registrar el egreso (devolución del dinero).
  const apertura = input.registrarEgresoCaja
    ? await prisma.aperturaCaja.findFirst({
        where: { usuarioId: user.userId, cierre: null },
        include: { caja: { select: { id: true } } },
      })
    : null;

  const establecimiento = original.establecimiento;
  const puntoExpedicionId = original.puntoExpedicionId;

  let intento = 0;
  while (true) {
    intento += 1;
    try {
      const nc = await prisma.$transaction(async (tx) => {
        const timbrado = await tx.timbrado.findFirst({
          where: {
            puntoExpedicionId,
            tipoDocumento: TipoDocumentoFiscal.NOTA_CREDITO,
            activo: true,
            fechaInicioVigencia: { lte: new Date() },
            fechaFinVigencia: { gte: new Date() },
          },
          include: { puntoExpedicion: { select: { codigo: true } } },
        });
        if (!timbrado) {
          throw Errors.conflict(
            'No hay timbrado activo de NOTA_CREDITO para el punto de expedición del comprobante',
          );
        }

        const siguiente = timbrado.ultimoNumeroUsado + 1;
        if (siguiente > timbrado.rangoHasta) {
          throw Errors.conflict('Timbrado de nota de crédito agotado — solicitá uno nuevo');
        }
        const updateRes = await tx.timbrado.updateMany({
          where: { id: timbrado.id, ultimoNumeroUsado: timbrado.ultimoNumeroUsado },
          data: { ultimoNumeroUsado: siguiente },
        });
        if (updateRes.count === 0) {
          throw new Prisma.PrismaClientKnownRequestError('numeracion race', {
            code: 'P2002',
            clientVersion: 'unknown',
          });
        }

        const ptoExpCodigo = timbrado.puntoExpedicion.codigo;
        const numeroDocumento = `${establecimiento}-${ptoExpCodigo}-${String(siguiente).padStart(7, '0')}`;

        const comprobante = await tx.comprobante.create({
          data: {
            empresaId,
            sucursalId: original.sucursalId,
            puntoExpedicionId,
            timbradoId: timbrado.id,
            cajaId: apertura?.cajaId ?? null,
            aperturaCajaId: apertura?.id ?? null,
            pedidoId: original.pedidoId,
            clienteId: original.clienteId,
            emitidoPorId: user.userId,
            tipoDocumento: TipoDocumentoFiscal.NOTA_CREDITO,
            establecimiento,
            puntoExpedicionCodigo: ptoExpCodigo,
            numero: siguiente,
            numeroDocumento,
            fechaEmision: new Date(),
            condicionVenta: original.condicionVenta,
            estado: EstadoComprobante.EMITIDO,
            comprobanteOriginalId: original.id,
            // Snapshot del receptor, copiado del original.
            receptorTipoContribuyente: original.receptorTipoContribuyente,
            receptorRuc: original.receptorRuc,
            receptorDv: original.receptorDv,
            receptorDocumento: original.receptorDocumento,
            receptorRazonSocial: original.receptorRazonSocial,
            receptorEmail: original.receptorEmail,
            receptorDireccion: original.receptorDireccion,
            subtotalExentas: totales.subtotalExentas,
            subtotalIva5: totales.subtotalIva5,
            subtotalIva10: totales.subtotalIva10,
            totalIva5: totales.totalIva5,
            totalIva10: totales.totalIva10,
            total: totalNc,
            items: { create: itemsNc },
          },
          include: {
            items: true,
            cliente: { select: { id: true, razonSocial: true, ruc: true, dv: true } },
          },
        });

        // Egreso de caja por la devolución (resta del efectivo esperado).
        if (apertura) {
          await tx.movimientoCaja.create({
            data: {
              cajaId: apertura.cajaId,
              aperturaCajaId: apertura.id,
              tipo: TipoMovimientoCaja.EGRESO,
              metodoPago: MetodoPago.EFECTIVO,
              monto: totalNc,
              concepto: `Nota de crédito ${numeroDocumento} (orig. ${original.numeroDocumento})`,
              comprobanteId: comprobante.id,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            empresaId,
            sucursalId: original.sucursalId,
            usuarioId: user.userId,
            accion: 'CREAR',
            entidad: 'Comprobante',
            entidadId: comprobante.id,
            metadata: {
              tipoDocumento: 'NOTA_CREDITO',
              numero: numeroDocumento,
              comprobanteOriginal: original.numeroDocumento,
              total: totalNc.toString(),
              motivo: input.motivo,
            },
          },
        });

        return comprobante;
      });

      // La NC es documento fiscal → siempre se manda a SIFEN en segundo plano.
      dispararEmision(nc.id);
      return nc;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        intento < 5
      ) {
        continue;
      }
      throw err;
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  LIST + DETAIL
// ───────────────────────────────────────────────────────────────────────────

export async function listarComprobantes(user: UserCtx, q: ListarComprobantesQuery) {
  if (!user.empresaId) return { comprobantes: [] };
  const where: Prisma.ComprobanteWhereInput = {
    empresaId: user.empresaId,
    deletedAt: null,
    ...(user.sucursalActivaId && !user.isSuperAdmin ? { sucursalId: user.sucursalActivaId } : {}),
    ...(q.pedidoId ? { pedidoId: q.pedidoId } : {}),
    ...(q.estado ? { estado: q.estado } : {}),
    ...(q.desde || q.hasta
      ? {
          fechaEmision: {
            ...(q.desde ? { gte: q.desde } : {}),
            ...(q.hasta ? { lte: q.hasta } : {}),
          },
        }
      : {}),
  };

  const comprobantes = await prisma.comprobante.findMany({
    where,
    take: q.pageSize,
    orderBy: { fechaEmision: 'desc' },
    select: {
      id: true,
      numeroDocumento: true,
      tipoDocumento: true,
      estado: true,
      estadoSifen: true,
      cdc: true,
      total: true,
      fechaEmision: true,
      cliente: { select: { id: true, razonSocial: true, ruc: true, dv: true } },
      pedido: { select: { id: true, numero: true } },
    },
  });
  return { comprobantes };
}

export async function obtenerComprobante(user: UserCtx, id: string) {
  const c = await prisma.comprobante.findUnique({
    where: { id },
    include: {
      items: true,
      pagos: true,
      cliente: true,
      timbrado: { select: { numero: true, fechaFinVigencia: true } },
      emitidoPor: { select: { id: true, nombreCompleto: true } },
      sucursal: { select: { nombre: true, direccion: true } },
      empresa: { select: { razonSocial: true, ruc: true, dv: true, direccion: true } },
      eventosSifen: { orderBy: { enviadoEn: 'desc' } },
      // Datos del descuento aplicado al pedido — para mostrar en el ticket
      // impreso (línea "Descuento ...", beneficiario si es empleado).
      pedido: {
        select: {
          id: true,
          numero: true,
          totalDescuento: true,
          descuentoTipo: true,
          motivoDescuento: { select: { id: true, nombre: true, codigoSistema: true } },
          empleadoBeneficiario: { select: { id: true, nombreCompleto: true } },
          // Snapshot del recargo aplicado al pedido (DELIVERY_PROPIO). Se muestra
          // como línea aparte en el ticket — el subtotal/IVA del comprobante NO
          // lo incluye, pero sí el total.
          recargoDelivery: true,
        },
      },
    },
  });
  if (!c) throw Errors.notFound('Comprobante no encontrado');
  if (!user.isSuperAdmin && c.empresaId !== user.empresaId) throw Errors.tenantMismatch();
  return c;
}

// ───────────────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────────────

async function resolverCliente(empresaId: string, clienteId: string | null) {
  if (clienteId) {
    const c = await prisma.cliente.findFirst({
      where: { id: clienteId, empresaId, deletedAt: null },
    });
    if (!c) throw Errors.validation({ clienteId: 'no encontrado' });
    return c;
  }
  // Default: consumidor final
  const cf = await prisma.cliente.findFirst({
    where: { empresaId, esConsumidorFinal: true, deletedAt: null },
  });
  if (!cf) throw Errors.notFound('Cliente "consumidor final" no encontrado');
  return cf;
}

interface ItemPedidoInput {
  cantidad: number;
  precioUnitario: bigint;
  precioModificadores: bigint;
  subtotal: bigint;
  productoVenta: { tasaIva: TasaIva };
  modificadores: { precioExtra: bigint; modificadorOpcion: { nombre: string } }[];
  combosOpcion: {
    comboGrupo: { nombre: string };
    comboGrupoOpcion: { productoVenta: { nombre: string } };
  }[];
}

/**
 * Discrimina subtotales e IVA por tasa a partir de montos IVA-incluidos. El IVA
 * va embebido en el precio (régimen PY): para 10% es monto/11, para 5% monto/21.
 */
function discriminarIva(items: { subtotal: bigint; tasaIva: TasaIva }[]) {
  let subtotalIva10 = 0n;
  let subtotalIva5 = 0n;
  let subtotalExentas = 0n;
  let totalIva10 = 0n;
  let totalIva5 = 0n;

  for (const it of items) {
    const monto = it.subtotal;
    if (it.tasaIva === TasaIva.IVA_10) {
      const iva = roundDiv(monto, 11n);
      subtotalIva10 += monto - iva;
      totalIva10 += iva;
    } else if (it.tasaIva === TasaIva.IVA_5) {
      const iva = roundDiv(monto, 21n);
      subtotalIva5 += monto - iva;
      totalIva5 += iva;
    } else {
      subtotalExentas += monto;
    }
  }

  return { subtotalIva10, subtotalIva5, subtotalExentas, totalIva10, totalIva5 };
}

function calcularTotalesComprobante(items: ItemPedidoInput[]) {
  return discriminarIva(
    items.map((it) => ({ subtotal: it.subtotal, tasaIva: it.productoVenta.tasaIva })),
  );
}

/**
 * Costo unitario estimado del item al momento de facturar. Debe reflejar el
 * MISMO consumo de insumos que `aplicarConfirmacionInline` descuenta del stock,
 * para que `ganancia = (precioUnitario - costoUnitarioSnapshot) * cantidad` cierre.
 *
 *  - Producto suelto: se calcula expandiendo su receta.
 *  - Combo: suma de los costos unitarios de cada opción elegida (cada eleccion
 *    descuenta su propia receta, igual que el flujo de stock).
 *  - Modificadores con vínculo de stock (XOR, igual que en `pedido.service`):
 *    - `productoVentaId` (ej. "Cheddar — porción"): suma el costo de su receta.
 *    - `productoInventarioId` (insumo directo, ej. "Huevo"): suma
 *      `cantidadInventario × costo del insumo`.
 *    Los modificadores sin vínculo (ej. "sin sal") no suman costo.
 *  - Sin receta ni vínculo → 0 (los productos de reventa toman su costo del
 *    insumo vinculado vía `expandirReceta`).
 *
 * Es un costo POR UNIDAD del item: los modificadores aplican a toda la línea, y
 * el reporte de rentabilidad lo multiplica por `cantidad` — igual que el stock,
 * que descuenta el consumo del modificador multiplicado por la cantidad.
 */
async function calcularCostoUnitarioItem(
  tx: Prisma.TransactionClient,
  it: {
    productoVentaId: string;
    combosOpcion: { comboGrupoOpcion: { productoVentaId: string } }[];
    modificadores: {
      modificadorOpcion: {
        productoVentaId: string | null;
        productoInventarioId: string | null;
        cantidadInventario: Prisma.Decimal | null;
      };
    }[];
  },
  sucursalId: string,
): Promise<bigint> {
  let total = 0n;

  // Costo base: el producto suelto, o la suma de las opciones del combo.
  if (it.combosOpcion.length > 0) {
    for (const eleccion of it.combosOpcion) {
      total += await calcularCostoUnitario(
        tx,
        eleccion.comboGrupoOpcion.productoVentaId,
        sucursalId,
      );
    }
  } else {
    total += await calcularCostoUnitario(tx, it.productoVentaId, sucursalId);
  }

  // Costo de los modificadores que consumen stock (sirve para producto suelto y
  // para componentes del combo — todos llegan acá en `it.modificadores`).
  for (const mod of it.modificadores) {
    const opcion = mod.modificadorOpcion;
    if (opcion.productoVentaId) {
      total += await calcularCostoUnitario(tx, opcion.productoVentaId, sucursalId);
    } else if (opcion.productoInventarioId && opcion.cantidadInventario) {
      total += await calcularCostoInsumoDirecto(
        tx,
        opcion.productoInventarioId,
        opcion.cantidadInventario,
        sucursalId,
      );
    }
  }

  return total;
}

function armarDescripcionItem(it: ItemPedidoInput & { productoVenta: { nombre: string } }): string {
  // En el ticket fiscal mostramos:
  //  - Sólo el nombre del producto (para combos NO desglosamos los componentes elegidos).
  //  - Sólo los modificadores con recargo (precioExtra > 0), porque son los
  //    que afectan el monto facturado. Los modificadores sin precio (sin sal,
  //    punto de cocción, etc.) van a la comanda/KDS pero no al cliente.
  const partes: string[] = [it.productoVenta.nombre];
  for (const m of it.modificadores) {
    if (m.precioExtra > 0n) {
      partes.push(`+ ${m.modificadorOpcion.nombre}`);
    }
  }
  return partes.join(' ');
}

function roundDiv(num: bigint, denom: bigint): bigint {
  const q = num / denom;
  const r = num % denom;
  if (r * 2n >= denom) return q + 1n;
  return q;
}
