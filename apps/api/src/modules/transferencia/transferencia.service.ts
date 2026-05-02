import { EstadoTransferencia, Prisma, TipoMovimientoStock } from '@prisma/client';

import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type {
  CrearTransferenciaInput,
  ListarTransferenciasQuery,
} from './transferencia.schemas.js';

interface UserCtx {
  userId: string;
  empresaId: string | null;
  sucursalActivaId: string | null;
  isSuperAdmin: boolean;
}

function requireEmpresa(user: UserCtx): string {
  if (user.isSuperAdmin && !user.empresaId) {
    throw Errors.forbidden('SUPER_ADMIN debe operar en una empresa específica');
  }
  if (!user.empresaId) throw Errors.unauthorized();
  return user.empresaId;
}

// ═════════════════════════════════════════════════════════════════════════
//  LISTAR / OBTENER
// ═════════════════════════════════════════════════════════════════════════

export async function listar(user: UserCtx, q: ListarTransferenciasQuery) {
  const empresaId = requireEmpresa(user);

  const where: Prisma.TransferenciaStockWhereInput = {
    sucursalOrigen: { empresaId },
    ...(q.sucursalOrigenId ? { sucursalOrigenId: q.sucursalOrigenId } : {}),
    ...(q.sucursalDestinoId ? { sucursalDestinoId: q.sucursalDestinoId } : {}),
    ...(q.fechaDesde || q.fechaHasta
      ? {
          fechaSolicitud: {
            ...(q.fechaDesde ? { gte: new Date(q.fechaDesde) } : {}),
            ...(q.fechaHasta ? { lte: new Date(q.fechaHasta) } : {}),
          },
        }
      : {}),
  };

  // Si user no es admin y tiene sucursalActiva, mostrar solo lo suyo (origen o destino)
  if (!user.isSuperAdmin && user.sucursalActivaId && !q.sucursalOrigenId && !q.sucursalDestinoId) {
    where.OR = [
      { sucursalOrigenId: user.sucursalActivaId },
      { sucursalDestinoId: user.sucursalActivaId },
    ];
  }

  const transferencias = await prisma.transferenciaStock.findMany({
    where,
    take: q.pageSize + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    orderBy: [{ fechaSolicitud: 'desc' }, { id: 'desc' }],
    include: {
      sucursalOrigen: { select: { id: true, codigo: true, nombre: true } },
      sucursalDestino: { select: { id: true, codigo: true, nombre: true } },
      _count: { select: { items: true } },
    },
  });

  const nextCursor = transferencias.length > q.pageSize ? transferencias[q.pageSize - 1]?.id : null;
  return {
    transferencias: transferencias.slice(0, q.pageSize),
    nextCursor,
  };
}

export async function obtener(user: UserCtx, id: string) {
  const empresaId = requireEmpresa(user);
  const t = await prisma.transferenciaStock.findFirst({
    where: { id, sucursalOrigen: { empresaId } },
    include: {
      sucursalOrigen: { select: { id: true, codigo: true, nombre: true } },
      sucursalDestino: { select: { id: true, codigo: true, nombre: true } },
      items: {
        include: {
          producto: {
            select: { id: true, nombre: true, codigo: true, unidadMedida: true },
          },
        },
      },
    },
  });
  if (!t) throw Errors.notFound('Transferencia no encontrada');

  // Resolver nombres de usuarios involucrados
  const userIds = [t.solicitadoPor, t.aprobadoPor, t.recibidoPor].filter((u): u is string =>
    Boolean(u),
  );
  const usuarios = userIds.length
    ? await prisma.usuario.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nombreCompleto: true },
      })
    : [];
  const userMap = new Map(usuarios.map((u) => [u.id, u.nombreCompleto]));

  return {
    ...t,
    solicitadoPorNombre: userMap.get(t.solicitadoPor) ?? null,
    aprobadoPorNombre: t.aprobadoPor ? (userMap.get(t.aprobadoPor) ?? null) : null,
    recibidoPorNombre: t.recibidoPor ? (userMap.get(t.recibidoPor) ?? null) : null,
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  CREAR (atómica: ejecuta el movimiento de stock en un solo paso)
// ═════════════════════════════════════════════════════════════════════════

export async function crear(user: UserCtx, input: CrearTransferenciaInput) {
  const empresaId = requireEmpresa(user);

  const [origen, destino] = await Promise.all([
    prisma.sucursal.findFirst({
      where: { id: input.sucursalOrigenId, empresaId, deletedAt: null },
      select: { id: true, activa: true, nombre: true },
    }),
    prisma.sucursal.findFirst({
      where: { id: input.sucursalDestinoId, empresaId, deletedAt: null },
      select: { id: true, activa: true, nombre: true },
    }),
  ]);
  if (!origen) throw Errors.notFound('Sucursal de origen no encontrada');
  if (!destino) throw Errors.notFound('Sucursal de destino no encontrada');
  if (!origen.activa) throw Errors.conflict(`Sucursal origen "${origen.nombre}" inactiva`);
  if (!destino.activa) throw Errors.conflict(`Sucursal destino "${destino.nombre}" inactiva`);

  // Si user no es admin y tiene sucursalActiva, sólo puede transferir desde la suya
  if (!user.isSuperAdmin && user.sucursalActivaId && user.sucursalActivaId !== origen.id) {
    throw Errors.forbidden(
      'Sólo podés generar transferencias desde tu sucursal activa. Cambiá de sucursal o pedí a un admin.',
    );
  }

  // Validar insumos
  const insumoIds = input.items.map((i) => i.productoInventarioId);
  if (new Set(insumoIds).size !== insumoIds.length) {
    throw Errors.conflict('Hay insumos duplicados — agrupalos en un solo item');
  }
  const insumos = await prisma.productoInventario.findMany({
    where: { id: { in: insumoIds }, empresaId, deletedAt: null },
    select: { id: true, activo: true, nombre: true },
  });
  if (insumos.length !== insumoIds.length) {
    throw Errors.notFound('Uno o más insumos no existen o pertenecen a otra empresa');
  }
  const inactivos = insumos.filter((i) => !i.activo);
  if (inactivos.length > 0) {
    throw Errors.conflict(`Insumos inactivos: ${inactivos.map((i) => i.nombre).join(', ')}.`);
  }

  const itemsData = input.items.map((i) => ({
    productoInventarioId: i.productoInventarioId,
    cantidad: new Prisma.Decimal(String(i.cantidad)),
  }));

  return prisma.$transaction(async (tx) => {
    // Numero correlativo por sucursal origen
    const ultima = await tx.transferenciaStock.findFirst({
      where: { sucursalOrigenId: input.sucursalOrigenId },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });
    const numero = (ultima?.numero ?? 0) + 1;

    const ahora = new Date();
    const transferencia = await tx.transferenciaStock.create({
      data: {
        sucursalOrigenId: input.sucursalOrigenId,
        sucursalDestinoId: input.sucursalDestinoId,
        numero,
        estado: EstadoTransferencia.RECIBIDA,
        solicitadoPor: user.userId,
        aprobadoPor: user.userId,
        recibidoPor: user.userId,
        fechaSolicitud: ahora,
        fechaAprobacion: ahora,
        fechaRecepcion: ahora,
        notas: input.notas,
        items: {
          create: itemsData.map((it) => ({
            productoInventarioId: it.productoInventarioId,
            cantidadSolicitada: it.cantidad,
            cantidadEnviada: it.cantidad,
            cantidadRecibida: it.cantidad,
          })),
        },
      },
      include: { items: true },
    });

    // Por cada item: dos movimientos (salida origen + entrada destino) + ajuste stock
    for (const item of transferencia.items) {
      // Salida origen
      await tx.movimientoStock.create({
        data: {
          productoInventarioId: item.productoInventarioId,
          sucursalId: input.sucursalOrigenId,
          usuarioId: user.userId,
          tipo: TipoMovimientoStock.SALIDA_TRANSFERENCIA,
          cantidad: item.cantidadSolicitada,
          cantidadSigned: item.cantidadSolicitada.negated(),
          transferenciaId: transferencia.id,
        },
      });
      // Entrada destino
      await tx.movimientoStock.create({
        data: {
          productoInventarioId: item.productoInventarioId,
          sucursalId: input.sucursalDestinoId,
          usuarioId: user.userId,
          tipo: TipoMovimientoStock.ENTRADA_TRANSFERENCIA,
          cantidad: item.cantidadSolicitada,
          cantidadSigned: item.cantidadSolicitada,
          transferenciaId: transferencia.id,
        },
      });

      // Decrementar origen
      const stockOrigen = await tx.stockSucursal.findUnique({
        where: {
          productoInventarioId_sucursalId: {
            productoInventarioId: item.productoInventarioId,
            sucursalId: input.sucursalOrigenId,
          },
        },
      });
      if (stockOrigen) {
        await tx.stockSucursal.update({
          where: { id: stockOrigen.id },
          data: { stockActual: { decrement: item.cantidadSolicitada } },
        });
      } else {
        // No existía registro de stock — creamos con negativo (stock negativo permitido)
        await tx.stockSucursal.create({
          data: {
            productoInventarioId: item.productoInventarioId,
            sucursalId: input.sucursalOrigenId,
            stockActual: item.cantidadSolicitada.negated(),
          },
        });
      }

      // Incrementar destino
      const stockDestino = await tx.stockSucursal.findUnique({
        where: {
          productoInventarioId_sucursalId: {
            productoInventarioId: item.productoInventarioId,
            sucursalId: input.sucursalDestinoId,
          },
        },
      });
      if (stockDestino) {
        await tx.stockSucursal.update({
          where: { id: stockDestino.id },
          data: { stockActual: { increment: item.cantidadSolicitada } },
        });
      } else {
        await tx.stockSucursal.create({
          data: {
            productoInventarioId: item.productoInventarioId,
            sucursalId: input.sucursalDestinoId,
            stockActual: item.cantidadSolicitada,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        empresaId,
        sucursalId: input.sucursalOrigenId,
        usuarioId: user.userId,
        accion: 'TRANSFERENCIA_STOCK',
        entidad: 'TransferenciaStock',
        entidadId: transferencia.id,
        metadata: {
          numero,
          sucursalOrigenId: input.sucursalOrigenId,
          sucursalDestinoId: input.sucursalDestinoId,
          items: input.items.length,
        },
      },
    });

    return transferencia;
  });
}
