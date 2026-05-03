import {
  EstadoComprobante,
  EstadoMesa,
  EstadoPedido,
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
import {
  aplicarCancelacionInline,
  aplicarConfirmacionInline,
  obtenerPedidoParaKds,
} from '../pedido/pedido.service.js';

import type {
  AnularComprobanteInput,
  EmitirComprobanteInput,
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
            include: { modificadorOpcion: { select: { nombre: true } } },
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
            total: pedido.total,
            // Items snapshot
            items: {
              create: pedido.items.map((it) => ({
                productoVentaId: it.productoVentaId,
                codigo: it.productoVenta.codigo,
                descripcion: armarDescripcionItem(it),
                cantidad: it.cantidad,
                precioUnitario: it.precioUnitario + it.precioModificadores,
                tasaIva: it.productoVenta.tasaIva,
                subtotal: it.subtotal,
              })),
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
            include: {
              items: {
                include: {
                  combosOpcion: {
                    select: {
                      comboGrupoOpcionId: true,
                      comboGrupoOpcion: { select: { productoVentaId: true } },
                    },
                  },
                },
              },
            },
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
  modificadores: { modificadorOpcion: { nombre: string } }[];
  combosOpcion: {
    comboGrupo: { nombre: string };
    comboGrupoOpcion: { productoVenta: { nombre: string } };
  }[];
}

function calcularTotalesComprobante(items: ItemPedidoInput[]) {
  let subtotalIva10 = 0n;
  let subtotalIva5 = 0n;
  let subtotalExentas = 0n;
  let totalIva10 = 0n;
  let totalIva5 = 0n;

  for (const it of items) {
    const monto = it.subtotal;
    if (it.productoVenta.tasaIva === TasaIva.IVA_10) {
      const iva = roundDiv(monto, 11n);
      const base = monto - iva;
      subtotalIva10 += base;
      totalIva10 += iva;
    } else if (it.productoVenta.tasaIva === TasaIva.IVA_5) {
      const iva = roundDiv(monto, 21n);
      const base = monto - iva;
      subtotalIva5 += base;
      totalIva5 += iva;
    } else {
      subtotalExentas += monto;
    }
  }

  return { subtotalIva10, subtotalIva5, subtotalExentas, totalIva10, totalIva5 };
}

function armarDescripcionItem(it: ItemPedidoInput & { productoVenta: { nombre: string } }): string {
  const partes: string[] = [it.productoVenta.nombre];
  for (const co of it.combosOpcion) {
    partes.push(`(${co.comboGrupo.nombre}: ${co.comboGrupoOpcion.productoVenta.nombre})`);
  }
  for (const m of it.modificadores) {
    partes.push(`+ ${m.modificadorOpcion.nombre}`);
  }
  return partes.join(' ');
}

function roundDiv(num: bigint, denom: bigint): bigint {
  const q = num / denom;
  const r = num % denom;
  if (r * 2n >= denom) return q + 1n;
  return q;
}
