import { Prisma, TipoMovimientoStock } from '@prisma/client';

import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type { CrearCompraInput, ListarComprasQuery } from './compra.schemas.js';

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

export async function listar(user: UserCtx, q: ListarComprasQuery) {
  const empresaId = requireEmpresa(user);
  const where: Prisma.CompraWhereInput = {
    sucursal: { empresaId },
    ...(q.proveedorId ? { proveedorId: q.proveedorId } : {}),
    ...(q.sucursalId ? { sucursalId: q.sucursalId } : {}),
    ...(q.numeroFactura
      ? { numeroFactura: { contains: q.numeroFactura, mode: 'insensitive' } }
      : {}),
    ...(q.fechaDesde || q.fechaHasta
      ? {
          fecha: {
            ...(q.fechaDesde ? { gte: new Date(q.fechaDesde) } : {}),
            ...(q.fechaHasta ? { lte: new Date(q.fechaHasta) } : {}),
          },
        }
      : {}),
  };

  // Si el user no es admin y tiene sucursalActiva, filtrar por ella
  if (!user.isSuperAdmin && user.sucursalActivaId) {
    where.sucursalId = q.sucursalId ?? user.sucursalActivaId;
  }

  const compras = await prisma.compra.findMany({
    where,
    take: q.pageSize + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
    include: {
      proveedor: { select: { id: true, razonSocial: true } },
      sucursal: { select: { id: true, codigo: true, nombre: true } },
      _count: { select: { items: true } },
    },
  });

  const nextCursor = compras.length > q.pageSize ? compras[q.pageSize - 1]?.id : null;
  return {
    compras: compras.slice(0, q.pageSize),
    nextCursor,
  };
}

export async function obtener(user: UserCtx, id: string) {
  const empresaId = requireEmpresa(user);
  const compra = await prisma.compra.findFirst({
    where: { id, sucursal: { empresaId } },
    include: {
      proveedor: true,
      sucursal: { select: { id: true, codigo: true, nombre: true, establecimiento: true } },
      items: {
        include: {
          producto: {
            select: {
              id: true,
              nombre: true,
              codigo: true,
              unidadMedida: true,
            },
          },
        },
      },
    },
  });
  if (!compra) throw Errors.notFound('Compra no encontrada');
  return compra;
}

// ═════════════════════════════════════════════════════════════════════════
//  CREAR (transaccional: registra compra + movimientos + stock)
// ═════════════════════════════════════════════════════════════════════════

export async function crear(user: UserCtx, input: CrearCompraInput) {
  const empresaId = requireEmpresa(user);

  // Validar proveedor y sucursal en la empresa
  const [proveedor, sucursal] = await Promise.all([
    prisma.proveedor.findFirst({
      where: { id: input.proveedorId, empresaId, deletedAt: null },
      select: { id: true, activo: true },
    }),
    prisma.sucursal.findFirst({
      where: { id: input.sucursalId, empresaId, deletedAt: null },
      select: { id: true, activa: true },
    }),
  ]);
  if (!proveedor) throw Errors.notFound('Proveedor no encontrado');
  if (!proveedor.activo) throw Errors.conflict('Proveedor inactivo — reactivalo antes de comprar');
  if (!sucursal) throw Errors.notFound('Sucursal no encontrada');
  if (!sucursal.activa) throw Errors.conflict('Sucursal inactiva');

  if (!user.isSuperAdmin && user.sucursalActivaId && user.sucursalActivaId !== sucursal.id) {
    throw Errors.sucursalNoAutorizada();
  }

  // Validar todos los insumos + traer su info
  const insumoIds = input.items.map((i) => i.productoInventarioId);
  const insumos = await prisma.productoInventario.findMany({
    where: { id: { in: insumoIds }, empresaId, deletedAt: null },
    select: { id: true, activo: true, nombre: true },
  });
  if (insumos.length !== new Set(insumoIds).size) {
    throw Errors.notFound('Uno o más insumos no existen o pertenecen a otra empresa');
  }
  const inactivos = insumos.filter((i) => !i.activo);
  if (inactivos.length > 0) {
    throw Errors.conflict(
      `Insumos inactivos: ${inactivos.map((i) => i.nombre).join(', ')}. Reactivalos primero.`,
    );
  }

  // Calcular subtotales y total
  const itemsConSubtotal = input.items.map((it) => {
    const subtotal = BigInt(Math.round(it.cantidad * it.costoUnitario));
    return {
      productoInventarioId: it.productoInventarioId,
      cantidad: new Prisma.Decimal(String(it.cantidad)),
      costoUnitario: BigInt(it.costoUnitario),
      subtotal,
    };
  });
  const total = itemsConSubtotal.reduce((acc, i) => acc + i.subtotal, BigInt(0));

  return prisma.$transaction(async (tx) => {
    // numero correlativo por sucursal
    const ultima = await tx.compra.findFirst({
      where: { sucursalId: input.sucursalId },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });
    const numero = (ultima?.numero ?? 0) + 1;

    // Crear compra con items
    const compra = await tx.compra.create({
      data: {
        proveedorId: input.proveedorId,
        sucursalId: input.sucursalId,
        numero,
        fecha: input.fecha ? new Date(input.fecha) : new Date(),
        numeroFactura: input.numeroFactura,
        notas: input.notas,
        total,
        items: { create: itemsConSubtotal },
      },
      include: { items: true },
    });

    // Por cada item: registrar movimiento de stock + upsert StockSucursal
    for (const item of compra.items) {
      await tx.movimientoStock.create({
        data: {
          productoInventarioId: item.productoInventarioId,
          sucursalId: input.sucursalId,
          usuarioId: user.userId,
          tipo: TipoMovimientoStock.ENTRADA_COMPRA,
          cantidad: item.cantidad,
          cantidadSigned: item.cantidad,
          costoUnitario: item.costoUnitario,
          compraId: compra.id,
        },
      });

      const exist = await tx.stockSucursal.findUnique({
        where: {
          productoInventarioId_sucursalId: {
            productoInventarioId: item.productoInventarioId,
            sucursalId: input.sucursalId,
          },
        },
      });
      if (exist) {
        await tx.stockSucursal.update({
          where: { id: exist.id },
          data: { stockActual: { increment: item.cantidad } },
        });
      } else {
        await tx.stockSucursal.create({
          data: {
            productoInventarioId: item.productoInventarioId,
            sucursalId: input.sucursalId,
            stockActual: item.cantidad,
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        empresaId,
        sucursalId: input.sucursalId,
        usuarioId: user.userId,
        accion: 'CREAR',
        entidad: 'Compra',
        entidadId: compra.id,
        metadata: {
          numero,
          proveedorId: input.proveedorId,
          numeroFactura: input.numeroFactura ?? null,
          total: total.toString(),
          items: input.items.length,
        },
      },
    });

    return compra;
  });
}

// ═════════════════════════════════════════════════════════════════════════
//  ELIMINAR (revierte stock + borra movimientos + borra compra)
// ═════════════════════════════════════════════════════════════════════════

/**
 * Elimina una compra cargada por error. La operación es atómica:
 *  - Decrementa el stock de cada insumo en la sucursal de la compra
 *    (puede dejar stock negativo — está permitido por diseño)
 *  - Borra los MovimientoStock que registraron las entradas de esa compra
 *  - Borra la Compra (cascada borra ItemCompra)
 *  - Loggea acción ELIMINAR en auditoría
 *
 * Pensado para corregir errores de carga reciente. Si parte del stock ya se
 * consumió (recetas, transferencias), igual se permite — el resultado es
 * stock negativo, que el admin debe regularizar con un ajuste manual.
 */
export async function eliminar(user: UserCtx, id: string) {
  const empresaId = requireEmpresa(user);

  const compra = await prisma.compra.findFirst({
    where: { id, sucursal: { empresaId } },
    include: { items: true, sucursal: { select: { id: true } } },
  });
  if (!compra) throw Errors.notFound('Compra no encontrada');

  if (!user.isSuperAdmin && user.sucursalActivaId && user.sucursalActivaId !== compra.sucursalId) {
    throw Errors.sucursalNoAutorizada();
  }

  return prisma.$transaction(async (tx) => {
    for (const item of compra.items) {
      const stock = await tx.stockSucursal.findUnique({
        where: {
          productoInventarioId_sucursalId: {
            productoInventarioId: item.productoInventarioId,
            sucursalId: compra.sucursalId,
          },
        },
      });
      if (stock) {
        await tx.stockSucursal.update({
          where: { id: stock.id },
          data: { stockActual: { decrement: item.cantidad } },
        });
      }
      // Si no existe el StockSucursal lo dejamos pasar — significa que ya se
      // borró la fila en algún otro flujo y no hay nada que revertir.
    }

    // Borrar movimientos asociados a esta compra. compraId no tiene FK formal,
    // pero el campo se setea sólo en MovimientoStock.create dentro de `crear`.
    await tx.movimientoStock.deleteMany({ where: { compraId: id } });

    // Borrar compra (cascada borra ItemCompra)
    await tx.compra.delete({ where: { id } });

    await tx.auditLog.create({
      data: {
        empresaId,
        sucursalId: compra.sucursalId,
        usuarioId: user.userId,
        accion: 'ELIMINAR',
        entidad: 'Compra',
        entidadId: id,
        metadata: {
          numero: compra.numero,
          proveedorId: compra.proveedorId,
          numeroFactura: compra.numeroFactura,
          total: compra.total.toString(),
          items: compra.items.length,
        },
      },
    });
  });
}
