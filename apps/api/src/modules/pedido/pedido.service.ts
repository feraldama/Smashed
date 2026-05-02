import {
  EstadoMesa,
  EstadoPedido,
  Prisma,
  type Rol,
  type SectorComanda,
  TasaIva,
  TipoMovimientoStock,
  TipoPedido,
} from '@prisma/client';

import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { emitPedido } from '../../lib/socketio.js';

import { expandirReceta } from './stock-recursivo.js';

import type {
  AgregarItemsInput,
  CancelarPedidoInput,
  CrearPedidoInput,
  ItemPedidoInput,
  ListarPedidosQuery,
  TransicionEstadoInput,
} from './pedido.schemas.js';

/**
 * Servicio de pedidos.
 *
 * Responsabilidades:
 *  - Crear pedido (estado PENDIENTE) con cálculo de precios + snapshot de modificadores
 *  - Confirmar pedido → descuento de stock recursivo (BOM) + cambio de estado
 *  - Transición de estados con guards
 *  - Cancelación con reverso de stock si ya estaba descontado
 *  - Listado y detalle
 *
 * NOTA: el descuento se hace al CONFIRMAR (no al crear), siguiendo decisión
 * del usuario: "Validación PREVIA + descuento al confirmar venta".
 * Stock negativo permitido — la operación procede aunque deje saldo negativo.
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
//  Matriz de transiciones permitidas
// ───────────────────────────────────────────────────────────────────────────

const TRANSICIONES: Record<EstadoPedido, EstadoPedido[]> = {
  PENDIENTE: [EstadoPedido.CONFIRMADO, EstadoPedido.CANCELADO],
  CONFIRMADO: [EstadoPedido.EN_PREPARACION, EstadoPedido.CANCELADO],
  EN_PREPARACION: [EstadoPedido.LISTO, EstadoPedido.CANCELADO],
  LISTO: [EstadoPedido.EN_CAMINO, EstadoPedido.ENTREGADO, EstadoPedido.CANCELADO],
  EN_CAMINO: [EstadoPedido.ENTREGADO, EstadoPedido.CANCELADO],
  ENTREGADO: [EstadoPedido.FACTURADO],
  FACTURADO: [],
  CANCELADO: [],
};

function transicionPermitida(actual: EstadoPedido, nuevo: EstadoPedido): boolean {
  return TRANSICIONES[actual].includes(nuevo);
}

/** Estados en los que el stock ya fue descontado y debe revertirse al cancelar. */
const ESTADOS_CON_STOCK_DESCONTADO: EstadoPedido[] = [
  EstadoPedido.CONFIRMADO,
  EstadoPedido.EN_PREPARACION,
  EstadoPedido.LISTO,
  EstadoPedido.EN_CAMINO,
  EstadoPedido.ENTREGADO,
  EstadoPedido.FACTURADO,
];

// ───────────────────────────────────────────────────────────────────────────
//  CREAR
// ───────────────────────────────────────────────────────────────────────────

export async function crearPedido(user: UserCtx, input: CrearPedidoInput) {
  if (!user.empresaId) throw Errors.forbidden('Usuario sin empresa');
  if (!user.sucursalActivaId) {
    throw Errors.forbidden('Seleccioná una sucursal activa antes de crear pedidos');
  }
  const empresaId = user.empresaId;
  const sucursalId = user.sucursalActivaId;

  const { itemsParaCrear, subtotal, totalIva } = await construirItemsPedido({
    empresaId,
    sucursalId,
    items: input.items,
  });
  const total = subtotal + totalIva;

  // 4) Validar mesa/cliente/dirección si vienen
  if (input.mesaId) {
    const mesa = await prisma.mesa.findFirst({
      where: { id: input.mesaId, zona: { sucursalId: user.sucursalActivaId } },
    });
    if (!mesa) throw Errors.validation({ mesaId: 'Mesa no encontrada en esta sucursal' });
  }
  if (input.clienteId) {
    const cliente = await prisma.cliente.findFirst({
      where: { id: input.clienteId, empresaId: user.empresaId, deletedAt: null },
    });
    if (!cliente) throw Errors.validation({ clienteId: 'Cliente no encontrado' });
  }

  // 5) Crear pedido en transacción. El número correlativo viene de un
  //    `UPDATE ... RETURNING` atómico sobre Sucursal.ultimoNumeroPedido — Postgres
  //    toma un row-lock exclusivo, así que las concurrentes hacen cola sin perder ni duplicar.
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ ultimo_numero_pedido: number }[]>`
      UPDATE "sucursal"
      SET "ultimo_numero_pedido" = "ultimo_numero_pedido" + 1
      WHERE "id" = ${sucursalId}
      RETURNING "ultimo_numero_pedido"
    `;
    const fila = rows[0];
    if (!fila) throw Errors.notFound('Sucursal no encontrada');
    const numero = fila.ultimo_numero_pedido;

    return tx.pedido.create({
      data: {
        empresaId,
        sucursalId,
        numero,
        tipo: input.tipo,
        estado: EstadoPedido.PENDIENTE,
        clienteId: input.clienteId,
        mesaId: input.mesaId,
        direccionEntregaId: input.direccionEntregaId,
        observaciones: input.observaciones,
        tomadoPorId: user.userId,
        tomadoEn: new Date(),
        subtotal,
        totalIva,
        total,
        items: { create: itemsParaCrear },
      },
      include: {
        items: {
          include: {
            modificadores: { include: { modificadorOpcion: true } },
            combosOpcion: { include: { comboGrupoOpcion: true, comboGrupo: true } },
            productoVenta: {
              select: { id: true, nombre: true, codigo: true, sectorComanda: true },
            },
          },
        },
        cliente: { select: { id: true, razonSocial: true } },
        mesa: { select: { id: true, numero: true } },
      },
    });
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  AGREGAR ITEMS — para cuenta abierta de mesa (round-trips)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Agrega items a un pedido existente (típicamente una mesa con la cuenta abierta).
 *
 * Reglas:
 *  - El pedido debe estar en PENDIENTE, CONFIRMADO o EN_PREPARACION.
 *  - Si está PENDIENTE, los items quedan en PENDIENTE (sin descontar stock — el stock
 *    se descuenta al confirmar el pedido entero).
 *  - Si está CONFIRMADO o EN_PREPARACION, los items nuevos entran como CONFIRMADO,
 *    se descuenta su stock inmediatamente, y el KDS los muestra en el tablero.
 *  - Recalcula subtotal/totalIva/total del pedido sumando los nuevos items.
 *  - Si el pedido estaba LISTO (cocina ya terminó), lo regresa a EN_PREPARACION.
 */
export async function agregarItemsAPedido(
  user: UserCtx,
  pedidoId: string,
  input: AgregarItemsInput,
) {
  if (!user.empresaId) throw Errors.forbidden('Usuario sin empresa');
  if (!user.sucursalActivaId) {
    throw Errors.forbidden('Seleccioná una sucursal activa');
  }

  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) throw Errors.notFound('Pedido no encontrado');
  assertTenant(user, pedido);

  const ESTADOS_PERMITIDOS: EstadoPedido[] = [
    EstadoPedido.PENDIENTE,
    EstadoPedido.CONFIRMADO,
    EstadoPedido.EN_PREPARACION,
    EstadoPedido.LISTO,
  ];
  if (!ESTADOS_PERMITIDOS.includes(pedido.estado)) {
    throw Errors.conflict(`No se pueden agregar items a un pedido en estado ${pedido.estado}`);
  }

  const {
    itemsParaCrear,
    subtotal: subtotalNuevo,
    totalIva: totalIvaNuevo,
  } = await construirItemsPedido({
    empresaId: user.empresaId,
    sucursalId: user.sucursalActivaId,
    items: input.items,
  });

  const yaConfirmado =
    pedido.estado === EstadoPedido.CONFIRMADO ||
    pedido.estado === EstadoPedido.EN_PREPARACION ||
    pedido.estado === EstadoPedido.LISTO;

  return prisma.$transaction(async (tx) => {
    // Crear los items. Si el pedido ya está confirmado, los nuevos items entran en
    // CONFIRMADO así el KDS los muestra; sino quedan PENDIENTE (default).
    const nuevoEstadoItem = yaConfirmado ? EstadoPedido.CONFIRMADO : EstadoPedido.PENDIENTE;

    const itemsCreados: { id: string; productoVentaId: string; cantidad: number }[] = [];
    for (const it of itemsParaCrear) {
      const created = await tx.itemPedido.create({
        data: {
          ...it,
          estado: nuevoEstadoItem,
          pedido: { connect: { id: pedidoId } },
        },
        include: {
          combosOpcion: {
            select: {
              comboGrupoOpcionId: true,
              comboGrupoOpcion: { select: { productoVentaId: true } },
            },
          },
        },
      });
      itemsCreados.push({
        id: created.id,
        productoVentaId: created.productoVentaId,
        cantidad: created.cantidad,
      });

      // Si ya hay stock descontado en el pedido, descontar el del item nuevo también.
      if (yaConfirmado) {
        const consumo = new Map<string, number>();
        if (created.combosOpcion.length > 0) {
          for (const eleccion of created.combosOpcion) {
            const sub = await expandirReceta(
              tx,
              eleccion.comboGrupoOpcion.productoVentaId,
              created.cantidad,
            );
            for (const [k, v] of sub) consumo.set(k, (consumo.get(k) ?? 0) + v);
          }
        } else {
          const sub = await expandirReceta(tx, created.productoVentaId, created.cantidad);
          for (const [k, v] of sub) consumo.set(k, (consumo.get(k) ?? 0) + v);
        }
        for (const [insumoId, cant] of consumo) {
          const cantDecimal = new Prisma.Decimal(cant.toFixed(3));
          await tx.movimientoStock.create({
            data: {
              productoInventarioId: insumoId,
              sucursalId: pedido.sucursalId,
              usuarioId: user.userId,
              tipo: TipoMovimientoStock.SALIDA_VENTA,
              cantidad: cantDecimal,
              cantidadSigned: cantDecimal.negated(),
              motivo: `Item agregado — pedido #${pedido.numero}`,
              pedidoId: pedido.id,
            },
          });
          const updated = await tx.stockSucursal.updateMany({
            where: { productoInventarioId: insumoId, sucursalId: pedido.sucursalId },
            data: { stockActual: { decrement: cantDecimal } },
          });
          if (updated.count === 0) {
            await tx.stockSucursal.create({
              data: {
                productoInventarioId: insumoId,
                sucursalId: pedido.sucursalId,
                stockActual: cantDecimal.negated(),
              },
            });
          }
        }
      }
    }

    // Si el pedido estaba LISTO (cocina terminó pero llegan items nuevos), volver a EN_PREP.
    const cambiarEstadoPedido = pedido.estado === EstadoPedido.LISTO;

    const actualizado = await tx.pedido.update({
      where: { id: pedidoId },
      data: {
        subtotal: pedido.subtotal + subtotalNuevo,
        totalIva: pedido.totalIva + totalIvaNuevo,
        total: pedido.total + subtotalNuevo + totalIvaNuevo,
        ...(cambiarEstadoPedido ? { estado: EstadoPedido.EN_PREPARACION, listoEn: null } : {}),
      },
      include: {
        items: {
          include: {
            modificadores: { include: { modificadorOpcion: true } },
            combosOpcion: { include: { comboGrupoOpcion: true, comboGrupo: true } },
            productoVenta: {
              select: { id: true, nombre: true, codigo: true, sectorComanda: true },
            },
          },
        },
        cliente: { select: { id: true, razonSocial: true } },
        mesa: { select: { id: true, numero: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        empresaId: pedido.empresaId,
        sucursalId: pedido.sucursalId,
        usuarioId: user.userId,
        accion: 'ACTUALIZAR',
        entidad: 'Pedido',
        entidadId: pedido.id,
        metadata: {
          operacion: 'AGREGAR_ITEMS',
          cantidad: itemsCreados.length,
          totalPrev: pedido.total.toString(),
          totalNuevo: actualizado.total.toString(),
        },
      },
    });

    emitPedido('pedido.actualizado', actualizado.sucursalId, {
      id: actualizado.id,
      numero: actualizado.numero,
      estado: actualizado.estado,
    });

    return actualizado;
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  CONFIRMAR — descuenta stock con expansión recursiva
// ───────────────────────────────────────────────────────────────────────────

export async function confirmarPedido(user: UserCtx, pedidoId: string) {
  return prisma
    .$transaction(async (tx) => {
      const pedido = await tx.pedido.findUnique({
        where: { id: pedidoId },
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
      if (!pedido) throw Errors.notFound('Pedido no encontrado');
      assertTenant(user, pedido);
      if (pedido.estado !== EstadoPedido.PENDIENTE) {
        throw Errors.conflict(
          `Solo se puede confirmar un pedido en estado PENDIENTE (actual: ${pedido.estado})`,
        );
      }

      // Expandir consumo total de insumos para todo el pedido
      const consumoTotal = new Map<string, number>();

      for (const item of pedido.items) {
        // Si es combo: expandir la receta de cada producto elegido en lugar del combo
        if (item.combosOpcion.length > 0) {
          for (const eleccion of item.combosOpcion) {
            const subConsumo = await expandirReceta(
              tx,
              eleccion.comboGrupoOpcion.productoVentaId,
              item.cantidad,
            );
            for (const [insumoId, cant] of subConsumo) {
              consumoTotal.set(insumoId, (consumoTotal.get(insumoId) ?? 0) + cant);
            }
          }
        } else {
          const subConsumo = await expandirReceta(tx, item.productoVentaId, item.cantidad);
          for (const [insumoId, cant] of subConsumo) {
            consumoTotal.set(insumoId, (consumoTotal.get(insumoId) ?? 0) + cant);
          }
        }
      }

      // Generar movimientos de stock + actualizar StockSucursal por cada insumo
      for (const [insumoId, cant] of consumoTotal) {
        const cantDecimal = new Prisma.Decimal(cant.toFixed(3));

        await tx.movimientoStock.create({
          data: {
            productoInventarioId: insumoId,
            sucursalId: pedido.sucursalId,
            usuarioId: user.userId,
            tipo: TipoMovimientoStock.SALIDA_VENTA,
            cantidad: cantDecimal,
            cantidadSigned: cantDecimal.negated(),
            motivo: `Venta — pedido #${pedido.numero}`,
            pedidoId: pedido.id,
          },
        });

        // Actualizar stock_actual (atomico via decrement). Si no existe el row, lo creamos.
        const updated = await tx.stockSucursal.updateMany({
          where: { productoInventarioId: insumoId, sucursalId: pedido.sucursalId },
          data: { stockActual: { decrement: cantDecimal } },
        });
        if (updated.count === 0) {
          await tx.stockSucursal.create({
            data: {
              productoInventarioId: insumoId,
              sucursalId: pedido.sucursalId,
              stockActual: cantDecimal.negated(),
            },
          });
        }
      }

      const actualizado = await tx.pedido.update({
        where: { id: pedidoId },
        data: {
          estado: EstadoPedido.CONFIRMADO,
          confirmadoEn: new Date(),
        },
      });

      // Si el pedido es de mesa, marcar la mesa como OCUPADA
      if (pedido.tipo === TipoPedido.MESA && pedido.mesaId) {
        await tx.mesa.update({
          where: { id: pedido.mesaId },
          data: { estado: EstadoMesa.OCUPADA },
        });
      }

      await tx.auditLog.create({
        data: {
          empresaId: pedido.empresaId,
          sucursalId: pedido.sucursalId,
          usuarioId: user.userId,
          accion: 'ACTUALIZAR',
          entidad: 'Pedido',
          entidadId: pedido.id,
          metadata: {
            de: 'PENDIENTE',
            a: 'CONFIRMADO',
            insumos_descontados: consumoTotal.size,
          },
        },
      });

      return actualizado;
    })
    .then(async (actualizado) => {
      const completo = await obtenerPedidoParaKds(pedidoId);
      if (completo) emitPedido('pedido.confirmado', completo.sucursalId, completo);
      return actualizado;
    });
}

// ───────────────────────────────────────────────────────────────────────────
//  TRANSICIONAR ESTADO (CONFIRMADO → EN_PREPARACION → LISTO → ENTREGADO ...)
// ───────────────────────────────────────────────────────────────────────────

export async function transicionarEstado(
  user: UserCtx,
  pedidoId: string,
  input: TransicionEstadoInput,
) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) throw Errors.notFound('Pedido no encontrado');
  assertTenant(user, pedido);

  const nuevo = input.estado as EstadoPedido;
  if (!transicionPermitida(pedido.estado, nuevo)) {
    throw Errors.conflict(`Transición no permitida: ${pedido.estado} → ${nuevo}`);
  }

  const ahora = new Date();
  const data: Prisma.PedidoUpdateInput = { estado: nuevo };
  if (nuevo === EstadoPedido.EN_PREPARACION) data.enPreparacionEn = ahora;
  if (nuevo === EstadoPedido.LISTO) data.listoEn = ahora;
  if (nuevo === EstadoPedido.EN_CAMINO) data.enCaminoEn = ahora;
  if (nuevo === EstadoPedido.ENTREGADO) data.entregadoEn = ahora;

  const updated = await prisma.pedido.update({ where: { id: pedidoId }, data });
  emitPedido('pedido.actualizado', updated.sucursalId, {
    id: updated.id,
    numero: updated.numero,
    estado: updated.estado,
  });
  return updated;
}

// ───────────────────────────────────────────────────────────────────────────
//  ITEM ESTADO — el KDS marca un item como EN_PREPARACION o LISTO.
// ───────────────────────────────────────────────────────────────────────────

export async function cambiarEstadoItem(
  user: UserCtx,
  pedidoId: string,
  itemId: string,
  nuevoEstado: 'EN_PREPARACION' | 'LISTO',
) {
  return prisma
    .$transaction(async (tx) => {
      const item = await tx.itemPedido.findUnique({
        where: { id: itemId },
        include: {
          pedido: { select: { id: true, sucursalId: true, empresaId: true, estado: true } },
          combosOpcion: { select: { id: true } },
        },
      });
      if (!item || item.pedidoId !== pedidoId) throw Errors.notFound('Item no encontrado');
      if (!user.isSuperAdmin && item.pedido.empresaId !== user.empresaId) {
        throw Errors.tenantMismatch();
      }
      if (item.pedido.estado === EstadoPedido.CANCELADO) {
        throw Errors.conflict('Pedido cancelado');
      }
      if (item.combosOpcion.length > 0) {
        // Items combo se transicionan a través de sus opciones para que cada sector
        // (cocina, bar, parrilla) marque sólo lo suyo.
        throw Errors.conflict(
          'Item combo: usá el endpoint de opciones del combo para marcar listo',
        );
      }

      const ahora = new Date();
      const itemUpdateData: Prisma.ItemPedidoUpdateInput = { estado: nuevoEstado };
      if (nuevoEstado === 'LISTO') itemUpdateData.listoEn = ahora;
      if (nuevoEstado === 'EN_PREPARACION') itemUpdateData.enPreparacionEn = ahora;
      await tx.itemPedido.update({ where: { id: itemId }, data: itemUpdateData });

      const pedidoEstadoNuevo = await recalcularEstadoPedido(
        tx,
        pedidoId,
        item.pedido.estado,
        ahora,
      );

      return {
        itemId,
        pedidoId,
        sucursalId: item.pedido.sucursalId,
        nuevoEstado,
        pedidoEstadoNuevo,
      };
    })
    .then((result) => {
      emitPedido('pedido.item.estado', result.sucursalId, {
        pedidoId: result.pedidoId,
        itemId: result.itemId,
        estado: result.nuevoEstado,
        pedidoEstado: result.pedidoEstadoNuevo,
      });
      return result;
    });
}

// ───────────────────────────────────────────────────────────────────────────
//  COMBO OPCION ESTADO — cocina/bar marca su parte del combo
// ───────────────────────────────────────────────────────────────────────────

/**
 * Marca una opción del combo como EN_PREPARACION o LISTO. Cada sector trabaja
 * independiente: la cocina marca la hamburguesa, el barman la cerveza. Cuando
 * todas las opciones del combo están LISTO, el ItemPedido pasa a LISTO también
 * (y cascadea al Pedido si todos los items están listos).
 */
export async function cambiarEstadoComboOpcion(
  user: UserCtx,
  pedidoId: string,
  comboOpcionId: string,
  nuevoEstado: 'EN_PREPARACION' | 'LISTO',
) {
  return prisma
    .$transaction(async (tx) => {
      const opcion = await tx.itemPedidoComboOpcion.findUnique({
        where: { id: comboOpcionId },
        include: {
          itemPedido: {
            select: {
              id: true,
              pedidoId: true,
              estado: true,
              pedido: {
                select: { id: true, sucursalId: true, empresaId: true, estado: true },
              },
            },
          },
        },
      });
      if (!opcion || opcion.itemPedido.pedidoId !== pedidoId) {
        throw Errors.notFound('Opción del combo no encontrada');
      }
      if (!user.isSuperAdmin && opcion.itemPedido.pedido.empresaId !== user.empresaId) {
        throw Errors.tenantMismatch();
      }
      if (opcion.itemPedido.pedido.estado === EstadoPedido.CANCELADO) {
        throw Errors.conflict('Pedido cancelado');
      }

      const ahora = new Date();
      const opcionUpdate: Prisma.ItemPedidoComboOpcionUpdateInput = { estado: nuevoEstado };
      if (nuevoEstado === 'LISTO') opcionUpdate.listoEn = ahora;
      if (nuevoEstado === 'EN_PREPARACION') opcionUpdate.enPreparacionEn = ahora;
      await tx.itemPedidoComboOpcion.update({
        where: { id: comboOpcionId },
        data: opcionUpdate,
      });

      const itemEstadoNuevo = await recalcularEstadoItemDesdeOpciones(
        tx,
        opcion.itemPedido.id,
        opcion.itemPedido.estado,
        ahora,
      );

      const pedidoEstadoNuevo = await recalcularEstadoPedido(
        tx,
        pedidoId,
        opcion.itemPedido.pedido.estado,
        ahora,
      );

      return {
        comboOpcionId,
        itemId: opcion.itemPedido.id,
        pedidoId,
        sucursalId: opcion.itemPedido.pedido.sucursalId,
        nuevoEstado,
        itemEstadoNuevo,
        pedidoEstadoNuevo,
      };
    })
    .then((result) => {
      emitPedido('pedido.combo-opcion.estado', result.sucursalId, {
        pedidoId: result.pedidoId,
        itemId: result.itemId,
        comboOpcionId: result.comboOpcionId,
        estado: result.nuevoEstado,
        itemEstado: result.itemEstadoNuevo,
        pedidoEstado: result.pedidoEstadoNuevo,
      });
      return result;
    });
}

/**
 * Para items tipo combo: recalcula el estado del ItemPedido a partir del estado
 * de sus opciones. Si todas están LISTO, el item se marca LISTO. Si alguna ya
 * arrancó preparación, el item pasa a EN_PREPARACION.
 */
async function recalcularEstadoItemDesdeOpciones(
  tx: Prisma.TransactionClient,
  itemId: string,
  estadoActual: EstadoPedido,
  ahora: Date,
): Promise<EstadoPedido | null> {
  const opciones = await tx.itemPedidoComboOpcion.findMany({
    where: { itemPedidoId: itemId },
    select: { estado: true },
  });
  if (opciones.length === 0) return null;

  const todasListas = opciones.every(
    (o) => o.estado === EstadoPedido.LISTO || o.estado === EstadoPedido.CANCELADO,
  );
  const algunaEnMarcha = opciones.some(
    (o) => o.estado !== EstadoPedido.PENDIENTE && o.estado !== EstadoPedido.CANCELADO,
  );

  if (todasListas && estadoActual !== EstadoPedido.LISTO) {
    await tx.itemPedido.update({
      where: { id: itemId },
      data: { estado: EstadoPedido.LISTO, listoEn: ahora },
    });
    return EstadoPedido.LISTO;
  }
  if (
    algunaEnMarcha &&
    (estadoActual === EstadoPedido.PENDIENTE || estadoActual === EstadoPedido.CONFIRMADO)
  ) {
    await tx.itemPedido.update({
      where: { id: itemId },
      data: { estado: EstadoPedido.EN_PREPARACION, enPreparacionEn: ahora },
    });
    return EstadoPedido.EN_PREPARACION;
  }
  return null;
}

/**
 * Si todos los items del pedido están LISTO, marca el pedido LISTO. Si algún item
 * arrancó preparación y el pedido estaba CONFIRMADO, lo pasa a EN_PREPARACION.
 *
 * No hace downgrade: si el pedido ya está FACTURADO/ENTREGADO/etc., los items siguen
 * su ciclo de preparación pero el pedido conserva su estado.
 */
async function recalcularEstadoPedido(
  tx: Prisma.TransactionClient,
  pedidoId: string,
  estadoActual: EstadoPedido,
  ahora: Date,
): Promise<EstadoPedido | null> {
  const enCocina =
    estadoActual === EstadoPedido.CONFIRMADO || estadoActual === EstadoPedido.EN_PREPARACION;
  if (!enCocina) return null;

  const items = await tx.itemPedido.findMany({
    where: { pedidoId },
    select: { estado: true },
  });
  if (items.length === 0) return null;

  const todosListos = items.every(
    (i) => i.estado === EstadoPedido.LISTO || i.estado === EstadoPedido.CANCELADO,
  );
  if (todosListos) {
    await tx.pedido.update({
      where: { id: pedidoId },
      data: { estado: EstadoPedido.LISTO, listoEn: ahora },
    });
    return EstadoPedido.LISTO;
  }
  if (estadoActual === EstadoPedido.CONFIRMADO) {
    const algunoEnMarcha = items.some(
      (i) => i.estado !== EstadoPedido.PENDIENTE && i.estado !== EstadoPedido.CANCELADO,
    );
    if (algunoEnMarcha) {
      await tx.pedido.update({
        where: { id: pedidoId },
        data: { estado: EstadoPedido.EN_PREPARACION, enPreparacionEn: ahora },
      });
      return EstadoPedido.EN_PREPARACION;
    }
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
//  KDS — pedidos relevantes para cocina
// ───────────────────────────────────────────────────────────────────────────

export async function listarPedidosParaKds(user: UserCtx, sector?: SectorComanda) {
  if (!user.empresaId || !user.sucursalActivaId) {
    if (!user.isSuperAdmin) throw Errors.forbidden('Seleccioná una sucursal');
    return { pedidos: [] };
  }

  // Reglas del KDS:
  //  - Con `sector`: sólo pedidos con al menos una sub-tarea de ese sector aún no lista.
  //    Apenas cocina/bar/etc. terminan lo suyo, el pedido cae de su tab.
  //  - Sin sector (Mostrador): cualquier pedido aún no entregado al cliente. Mostrador
  //    sigue viendo el pedido aún cuando todas las sub-tareas están listas, hasta
  //    que el cajero apriete "Entregar al cliente" (entregadoEn = now).
  const filtroBase: Prisma.PedidoWhereInput = {
    sucursalId: user.sucursalActivaId,
    deletedAt: null,
    estado: { notIn: [EstadoPedido.PENDIENTE, EstadoPedido.CANCELADO] },
  };

  const filtroVista: Prisma.PedidoWhereInput = sector
    ? {
        OR: [
          {
            // Items no-combo del sector aún no listos. Excluimos combos (combosOpcion.none)
            // porque el item-combo hereda un sectorComanda del producto padre que NO refleja
            // la realidad — lo que importa para el sector es el sector de cada opción elegida.
            items: {
              some: {
                combosOpcion: { none: {} },
                sectorComanda: sector,
                estado: { notIn: [EstadoPedido.LISTO, EstadoPedido.CANCELADO] },
              },
            },
          },
          {
            // Combo opciones del sector aún no listas
            items: {
              some: {
                combosOpcion: {
                  some: {
                    sectorComanda: sector,
                    estado: { notIn: [EstadoPedido.LISTO, EstadoPedido.CANCELADO] },
                  },
                },
              },
            },
          },
        ],
      }
    : {
        entregadoEn: null,
        items: { some: { estado: { not: EstadoPedido.CANCELADO } } },
      };

  const pedidos = await prisma.pedido.findMany({
    where: { ...filtroBase, ...filtroVista },
    orderBy: { confirmadoEn: 'asc' },
    take: 100,
    include: kdsInclude,
  });

  return { pedidos };
}

// ───────────────────────────────────────────────────────────────────────────
//  ENTREGAR — Mostrador cierra el pedido (le da al cliente)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Marca un pedido como entregado al cliente. Setea `entregadoEn = now` para que
 * caiga del KDS de Mostrador. No cambia el estado del pedido — para pedidos
 * MOSTRADOR/DELIVERY el estado típicamente ya está en FACTURADO (cobro inmediato),
 * y el state machine no permite transicionar desde ahí.
 *
 * Para pedidos en estado LISTO (mesa con cuenta abierta que recién terminó cocina),
 * además avanza el estado a ENTREGADO siguiendo la matriz normal.
 */
export async function entregarPedido(user: UserCtx, pedidoId: string) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedido.findUnique({ where: { id: pedidoId } });
    if (!pedido) throw Errors.notFound('Pedido no encontrado');
    assertTenant(user, pedido);
    if (pedido.estado === EstadoPedido.CANCELADO) {
      throw Errors.conflict('Pedido cancelado');
    }
    if (pedido.entregadoEn) {
      throw Errors.conflict('Pedido ya entregado');
    }

    const ahora = new Date();
    const data: Prisma.PedidoUpdateInput = { entregadoEn: ahora };
    // Si el flujo del state machine permite avanzar a ENTREGADO, lo hacemos.
    // (Caso típico: mesa con cuenta abierta que terminó cocina — pedido en LISTO.)
    if (transicionPermitida(pedido.estado, EstadoPedido.ENTREGADO)) {
      data.estado = EstadoPedido.ENTREGADO;
    }

    const actualizado = await tx.pedido.update({ where: { id: pedidoId }, data });

    await tx.auditLog.create({
      data: {
        empresaId: pedido.empresaId,
        sucursalId: pedido.sucursalId,
        usuarioId: user.userId,
        accion: 'ACTUALIZAR',
        entidad: 'Pedido',
        entidadId: pedido.id,
        metadata: { operacion: 'ENTREGAR_KDS', estadoPrev: pedido.estado },
      },
    });

    emitPedido('pedido.actualizado', actualizado.sucursalId, {
      id: actualizado.id,
      numero: actualizado.numero,
      estado: actualizado.estado,
    });

    return actualizado;
  });
}

const kdsInclude = {
  items: {
    where: { estado: { not: EstadoPedido.CANCELADO } },
    include: {
      productoVenta: {
        select: { id: true, nombre: true, sectorComanda: true, tiempoPrepSegundos: true },
      },
      modificadores: {
        include: { modificadorOpcion: { select: { nombre: true } } },
      },
      combosOpcion: {
        include: {
          comboGrupo: { select: { nombre: true } },
          comboGrupoOpcion: {
            include: {
              productoVenta: { select: { nombre: true, sectorComanda: true } },
            },
          },
        },
      },
    },
  },
  mesa: { select: { id: true, numero: true } },
  cliente: { select: { id: true, razonSocial: true } },
} satisfies Prisma.PedidoInclude;

async function obtenerPedidoParaKds(pedidoId: string) {
  return prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: kdsInclude,
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  CANCELAR — con reverso de stock si corresponde
// ───────────────────────────────────────────────────────────────────────────

export async function cancelarPedido(user: UserCtx, pedidoId: string, input: CancelarPedidoInput) {
  return prisma
    .$transaction(async (tx) => {
      const pedido = await tx.pedido.findUnique({ where: { id: pedidoId } });
      if (!pedido) throw Errors.notFound('Pedido no encontrado');
      assertTenant(user, pedido);

      if (pedido.estado === EstadoPedido.CANCELADO) {
        throw Errors.conflict('Pedido ya cancelado');
      }
      if (pedido.estado === EstadoPedido.FACTURADO) {
        throw Errors.conflict('No se puede cancelar un pedido FACTURADO. Emití nota de crédito.');
      }

      // Si el stock estaba descontado, revertir
      if (ESTADOS_CON_STOCK_DESCONTADO.includes(pedido.estado)) {
        const movimientos = await tx.movimientoStock.findMany({
          where: { pedidoId, tipo: TipoMovimientoStock.SALIDA_VENTA },
        });

        for (const mov of movimientos) {
          // Reverso = ENTRADA_AJUSTE con cantidad positiva
          await tx.movimientoStock.create({
            data: {
              productoInventarioId: mov.productoInventarioId,
              sucursalId: mov.sucursalId,
              usuarioId: user.userId,
              tipo: TipoMovimientoStock.ENTRADA_AJUSTE,
              cantidad: mov.cantidad,
              cantidadSigned: mov.cantidad,
              motivo: `Cancelación pedido #${pedido.numero}: ${input.motivo}`,
              pedidoId: pedido.id,
            },
          });
          await tx.stockSucursal.updateMany({
            where: { productoInventarioId: mov.productoInventarioId, sucursalId: mov.sucursalId },
            data: { stockActual: { increment: mov.cantidad } },
          });
        }
      }

      const actualizado = await tx.pedido.update({
        where: { id: pedidoId },
        data: {
          estado: EstadoPedido.CANCELADO,
          canceladoEn: new Date(),
          motivoCancel: input.motivo,
        },
      });

      // Si el pedido era de mesa y la mesa estaba OCUPADA por este pedido, liberarla
      if (pedido.tipo === TipoPedido.MESA && pedido.mesaId) {
        await tx.mesa.update({
          where: { id: pedido.mesaId },
          data: { estado: EstadoMesa.LIBRE },
        });
      }

      await tx.auditLog.create({
        data: {
          empresaId: pedido.empresaId,
          sucursalId: pedido.sucursalId,
          usuarioId: user.userId,
          accion: 'ACTUALIZAR',
          entidad: 'Pedido',
          entidadId: pedido.id,
          metadata: { de: pedido.estado, a: 'CANCELADO', motivo: input.motivo },
        },
      });

      return actualizado;
    })
    .then((actualizado) => {
      emitPedido('pedido.cancelado', actualizado.sucursalId, {
        id: actualizado.id,
        numero: actualizado.numero,
      });
      return actualizado;
    });
}

// ───────────────────────────────────────────────────────────────────────────
//  LIST + DETAIL
// ───────────────────────────────────────────────────────────────────────────

export async function listarPedidos(user: UserCtx, q: ListarPedidosQuery) {
  if (!user.empresaId) return { pedidos: [] };
  if (!user.sucursalActivaId && !user.isSuperAdmin) {
    throw Errors.forbidden('Seleccioná una sucursal');
  }

  const where: Prisma.PedidoWhereInput = {
    empresaId: user.empresaId,
    deletedAt: null,
    ...(user.sucursalActivaId ? { sucursalId: user.sucursalActivaId } : {}),
    ...(q.estado ? { estado: q.estado } : {}),
    ...(q.tipo ? { tipo: q.tipo } : {}),
    ...(q.desde || q.hasta
      ? {
          createdAt: { ...(q.desde ? { gte: q.desde } : {}), ...(q.hasta ? { lte: q.hasta } : {}) },
        }
      : {}),
  };

  const pedidos = await prisma.pedido.findMany({
    where,
    take: q.pageSize,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      numero: true,
      tipo: true,
      estado: true,
      total: true,
      createdAt: true,
      cliente: { select: { id: true, razonSocial: true } },
      mesa: { select: { id: true, numero: true } },
      _count: { select: { items: true } },
    },
  });

  return { pedidos };
}

export async function obtenerPedido(user: UserCtx, pedidoId: string) {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: {
      items: {
        include: {
          productoVenta: { select: { id: true, nombre: true, codigo: true, sectorComanda: true } },
          modificadores: {
            include: {
              modificadorOpcion: { select: { id: true, nombre: true, precioExtra: true } },
            },
          },
          combosOpcion: {
            include: {
              comboGrupo: { select: { id: true, nombre: true } },
              comboGrupoOpcion: {
                include: {
                  productoVenta: { select: { id: true, nombre: true } },
                },
              },
            },
          },
        },
      },
      cliente: { select: { id: true, razonSocial: true, ruc: true, dv: true } },
      mesa: { select: { id: true, numero: true } },
      tomadoPor: { select: { id: true, nombreCompleto: true } },
    },
  });
  if (!pedido) throw Errors.notFound('Pedido no encontrado');
  assertTenant(user, pedido);
  return pedido;
}

// ───────────────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────────────

function assertTenant(user: UserCtx, pedido: { empresaId: string; sucursalId: string }) {
  if (user.isSuperAdmin) return;
  if (pedido.empresaId !== user.empresaId) throw Errors.tenantMismatch();
  if (user.sucursalActivaId && pedido.sucursalId !== user.sucursalActivaId) {
    // Para gerencia/admin permitimos ver de otras sucursales si tienen acceso (TODO: validar)
    if (!ROLES_GESTION.includes(user.rol)) {
      throw Errors.sucursalNoAutorizada();
    }
  }
}

/**
 * Valida y construye los `Prisma.ItemPedidoCreateWithoutPedidoInput[]` a partir
 * del input del usuario, calculando subtotales e IVA discriminado.
 *
 * Usado por `crearPedido` (todos los items de un pedido nuevo) y
 * `agregarItemsAPedido` (items adicionales sobre un pedido existente).
 *
 * Throws: ValidationError si producto inexistente, combo mal configurado, etc.
 */
async function construirItemsPedido(args: {
  empresaId: string;
  sucursalId: string;
  items: ItemPedidoInput[];
}): Promise<{
  itemsParaCrear: Prisma.ItemPedidoCreateWithoutPedidoInput[];
  subtotal: bigint;
  totalIva: bigint;
}> {
  const { empresaId, sucursalId, items } = args;

  const productoIds = [...new Set(items.map((i) => i.productoVentaId))];
  const productos = await prisma.productoVenta.findMany({
    where: { id: { in: productoIds }, empresaId, deletedAt: null },
    select: {
      id: true,
      nombre: true,
      precioBase: true,
      tasaIva: true,
      sectorComanda: true,
      esCombo: true,
      esVendible: true,
      activo: true,
      modificadorGrupos: { select: { modificadorGrupoId: true } },
      combo: {
        select: {
          grupos: {
            select: {
              id: true,
              obligatorio: true,
              opciones: {
                select: {
                  id: true,
                  precioExtra: true,
                  // Necesitamos el sector del producto elegido para que cada opción
                  // del combo se enrute al sector correcto en el KDS (cocina/bar/...).
                  productoVenta: { select: { sectorComanda: true } },
                },
              },
            },
          },
        },
      },
      preciosSucursal: {
        where: {
          sucursalId,
          vigenteDesde: { lte: new Date() },
          OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: new Date() } }],
        },
        orderBy: { vigenteDesde: 'desc' },
        take: 1,
        select: { precio: true },
      },
    },
  });
  const productoMap = new Map(productos.map((p) => [p.id, p]));

  const modificadorOpcionIds = [
    ...new Set(items.flatMap((i) => i.modificadores?.map((m) => m.modificadorOpcionId) ?? [])),
  ];
  const modOpciones = modificadorOpcionIds.length
    ? await prisma.modificadorOpcion.findMany({
        where: { id: { in: modificadorOpcionIds } },
        select: { id: true, precioExtra: true, modificadorGrupoId: true },
      })
    : [];
  const modMap = new Map(modOpciones.map((m) => [m.id, m]));

  const itemsParaCrear: Prisma.ItemPedidoCreateWithoutPedidoInput[] = [];
  let subtotal = 0n;
  let totalIva = 0n;

  for (const it of items) {
    const prod = productoMap.get(it.productoVentaId);
    if (!prod)
      throw Errors.validation({ productoVentaId: 'no encontrado o no pertenece a tu empresa' });
    if (!prod.activo || !prod.esVendible) {
      throw Errors.validation({ productoVentaId: `Producto "${prod.nombre}" no está disponible` });
    }

    const precioBase = prod.preciosSucursal[0]?.precio ?? prod.precioBase;

    let extraCombo = 0n;
    if (prod.esCombo) {
      if (!prod.combo) {
        throw Errors.validation({ producto: 'Producto marcado como combo pero sin configuración' });
      }
      const elegidas = it.combosOpcion ?? [];
      const grupoMap = new Map(prod.combo.grupos.map((g) => [g.id, g]));
      for (const grupo of prod.combo.grupos) {
        if (grupo.obligatorio && !elegidas.some((e) => e.comboGrupoId === grupo.id)) {
          throw Errors.validation({ combo: `Falta elegir opción para un grupo obligatorio` });
        }
      }
      for (const eleccion of elegidas) {
        const grupo = grupoMap.get(eleccion.comboGrupoId);
        if (!grupo) throw Errors.validation({ combo: 'comboGrupoId inválido para este combo' });
        const opcion = grupo.opciones.find((o) => o.id === eleccion.comboGrupoOpcionId);
        if (!opcion)
          throw Errors.validation({ combo: 'comboGrupoOpcionId inválido para el grupo' });
        extraCombo += opcion.precioExtra;
      }
    } else if (it.combosOpcion?.length) {
      throw Errors.validation({ combo: 'Producto no es combo pero se enviaron combosOpcion' });
    }

    let extraMod = 0n;
    const gruposPermitidos = new Set(prod.modificadorGrupos.map((m) => m.modificadorGrupoId));
    for (const mod of it.modificadores ?? []) {
      const opcion = modMap.get(mod.modificadorOpcionId);
      if (!opcion) throw Errors.validation({ modificadores: 'Opción no encontrada' });
      if (!gruposPermitidos.has(opcion.modificadorGrupoId)) {
        throw Errors.validation({ modificadores: 'Esa opción no aplica a este producto' });
      }
      extraMod += opcion.precioExtra;
    }

    const precioUnit = precioBase + extraCombo;
    const subtotalItem = (precioUnit + extraMod) * BigInt(it.cantidad);
    const ivaItem = calcularIva(subtotalItem, prod.tasaIva);
    subtotal += subtotalItem - ivaItem;
    totalIva += ivaItem;

    itemsParaCrear.push({
      productoVenta: { connect: { id: it.productoVentaId } },
      cantidad: it.cantidad,
      precioUnitario: precioUnit,
      precioModificadores: extraMod,
      subtotal: subtotalItem,
      observaciones: it.observaciones,
      sectorComanda: prod.sectorComanda,
      modificadores: it.modificadores?.length
        ? {
            create: it.modificadores.map((m) => ({
              modificadorOpcion: { connect: { id: m.modificadorOpcionId } },
              precioExtra: modMap.get(m.modificadorOpcionId)?.precioExtra ?? 0n,
            })),
          }
        : undefined,
      combosOpcion: it.combosOpcion?.length
        ? {
            create: it.combosOpcion.map((co) => {
              const opcion = prod.combo?.grupos
                .find((g) => g.id === co.comboGrupoId)
                ?.opciones.find((o) => o.id === co.comboGrupoOpcionId);
              return {
                comboGrupo: { connect: { id: co.comboGrupoId } },
                comboGrupoOpcion: { connect: { id: co.comboGrupoOpcionId } },
                precioExtra: opcion?.precioExtra ?? 0n,
                sectorComanda: opcion?.productoVenta.sectorComanda ?? prod.sectorComanda,
              };
            }),
          }
        : undefined,
    });
  }

  return { itemsParaCrear, subtotal, totalIva };
}

function calcularIva(montoConIva: bigint, tasa: TasaIva): bigint {
  // Mismo algoritmo que shared-utils.discriminarIva pero en BigInt
  switch (tasa) {
    case TasaIva.IVA_10: {
      // iva = monto / 11 (redondeo hacia el más cercano)
      const numerador = montoConIva * 1n;
      const divisor = 11n;
      return roundDiv(numerador, divisor);
    }
    case TasaIva.IVA_5:
      return roundDiv(montoConIva, 21n);
    case TasaIva.IVA_0:
    case TasaIva.EXENTO:
      return 0n;
  }
}

function roundDiv(num: bigint, denom: bigint): bigint {
  // Redondeo half-away-from-zero
  const q = num / denom;
  const r = num % denom;
  if (r * 2n >= denom) return q + 1n;
  return q;
}
