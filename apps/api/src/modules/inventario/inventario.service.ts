import { Prisma, TipoMovimientoStock } from '@prisma/client';

import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type {
  ActualizarInsumoInput,
  AjustarStockInput,
  CrearInsumoInput,
  ListarInsumosQuery,
  SetStockMinimosInput,
} from './inventario.schemas.js';

/**
 * Servicio de inventario (insumos + stock).
 *
 * - CRUD de ProductoInventario con tenant guard
 * - Listado con stock por sucursal (si se pide)
 * - Ajuste de stock manual con motivo + audit log
 *   (los descuentos automáticos por venta los hace el módulo pedido)
 */

interface UserCtx {
  userId: string;
  empresaId: string;
  sucursalActivaId: string | null;
  isSuperAdmin: boolean;
}

const ENTRADAS: TipoMovimientoStock[] = [
  TipoMovimientoStock.ENTRADA_AJUSTE,
  TipoMovimientoStock.ENTRADA_COMPRA,
  TipoMovimientoStock.ENTRADA_PRODUCCION,
  TipoMovimientoStock.ENTRADA_TRANSFERENCIA,
];

// ───── Insumos: list / detail ─────

export async function listarInsumos(empresaId: string, q: ListarInsumosQuery, sucursalId?: string) {
  const where: Prisma.ProductoInventarioWhereInput = {
    empresaId,
    deletedAt: null,
    ...(q.busqueda
      ? {
          OR: [
            { nombre: { contains: q.busqueda, mode: 'insensitive' } },
            { codigo: { contains: q.busqueda, mode: 'insensitive' } },
            { codigoBarras: q.busqueda },
            { categoria: { contains: q.busqueda, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(q.categoria ? { categoria: q.categoria } : {}),
    ...(q.proveedorId ? { proveedorId: q.proveedorId } : {}),
  };

  const insumos = await prisma.productoInventario.findMany({
    where,
    take: q.pageSize,
    orderBy: [{ nombre: 'asc' }],
    select: {
      id: true,
      codigo: true,
      codigoBarras: true,
      nombre: true,
      descripcion: true,
      unidadMedida: true,
      costoUnitario: true,
      categoria: true,
      activo: true,
      proveedor: { select: { id: true, razonSocial: true } },
      ...(sucursalId
        ? {
            stockSucursal: {
              where: { sucursalId },
              take: 1,
              select: { stockActual: true, stockMinimo: true, stockMaximo: true },
            },
          }
        : {}),
    },
  });

  return insumos.map((i) => ({
    ...i,
    stock:
      'stockSucursal' in i && Array.isArray(i.stockSucursal) ? (i.stockSucursal[0] ?? null) : null,
  }));
}

export async function obtenerInsumo(empresaId: string, id: string) {
  const insumo = await prisma.productoInventario.findFirst({
    where: { id, empresaId, deletedAt: null },
    include: {
      proveedor: { select: { id: true, razonSocial: true } },
      stockSucursal: {
        include: { sucursal: { select: { id: true, nombre: true, codigo: true } } },
        orderBy: { sucursal: { nombre: 'asc' } },
      },
    },
  });
  if (!insumo) throw Errors.notFound('Insumo no encontrado');
  return insumo;
}

// ───── CRUD ─────

export async function crearInsumo(empresaId: string, input: CrearInsumoInput) {
  if (input.proveedorId) {
    const prov = await prisma.proveedor.findFirst({
      where: { id: input.proveedorId, empresaId, deletedAt: null },
    });
    if (!prov) throw Errors.validation({ proveedorId: 'no encontrado' });
  }

  // Verificar duplicados por código si se pasa
  if (input.codigo) {
    const dup = await prisma.productoInventario.findFirst({
      where: { empresaId, codigo: input.codigo, deletedAt: null },
    });
    if (dup) throw Errors.conflict(`Ya existe un insumo con código "${input.codigo}"`);
  }
  if (input.codigoBarras) {
    const dup = await prisma.productoInventario.findFirst({
      where: { empresaId, codigoBarras: input.codigoBarras, deletedAt: null },
    });
    if (dup)
      throw Errors.conflict(`Ya existe un insumo con código de barras "${input.codigoBarras}"`);
  }

  return prisma.productoInventario.create({
    data: { empresaId, ...input },
    include: { proveedor: { select: { id: true, razonSocial: true } } },
  });
}

export async function actualizarInsumo(
  empresaId: string,
  id: string,
  input: ActualizarInsumoInput,
) {
  const insumo = await prisma.productoInventario.findFirst({
    where: { id, empresaId, deletedAt: null },
  });
  if (!insumo) throw Errors.notFound('Insumo no encontrado');

  if (input.proveedorId) {
    const prov = await prisma.proveedor.findFirst({
      where: { id: input.proveedorId, empresaId, deletedAt: null },
    });
    if (!prov) throw Errors.validation({ proveedorId: 'no encontrado' });
  }

  return prisma.productoInventario.update({
    where: { id },
    data: input,
    include: { proveedor: { select: { id: true, razonSocial: true } } },
  });
}

export async function eliminarInsumo(empresaId: string, id: string) {
  const insumo = await prisma.productoInventario.findFirst({
    where: { id, empresaId, deletedAt: null },
  });
  if (!insumo) throw Errors.notFound('Insumo no encontrado');

  const itemsEnRecetas = await prisma.itemReceta.findMany({
    where: {
      productoInventarioId: id,
      receta: { deletedAt: null },
    },
    select: {
      receta: {
        select: {
          id: true,
          productoVenta: { select: { nombre: true } },
        },
      },
    },
  });

  if (itemsEnRecetas.length > 0) {
    const nombresUnicos = Array.from(
      new Map(itemsEnRecetas.map((it) => [it.receta.id, it.receta.productoVenta.nombre])).values(),
    );
    const MAX_LISTAR = 5;
    const visibles = nombresUnicos.slice(0, MAX_LISTAR);
    const restantes = nombresUnicos.length - visibles.length;
    const lista =
      visibles.map((n) => `• ${n}`).join('\n') + (restantes > 0 ? `\n• y ${restantes} más` : '');
    throw Errors.conflict(
      `No se puede eliminar — está usado en ${nombresUnicos.length} receta(s) activa(s):\n${lista}`,
    );
  }

  return prisma.productoInventario.update({
    where: { id },
    data: { deletedAt: new Date(), activo: false },
  });
}

// ───── Ajuste de stock ─────

export async function ajustarStock(user: UserCtx, input: AjustarStockInput) {
  // Validar tenant
  const [insumo, sucursal] = await Promise.all([
    prisma.productoInventario.findFirst({
      where: { id: input.productoInventarioId, empresaId: user.empresaId, deletedAt: null },
    }),
    prisma.sucursal.findFirst({
      where: { id: input.sucursalId, empresaId: user.empresaId, deletedAt: null },
    }),
  ]);
  if (!insumo) throw Errors.notFound('Insumo no encontrado');
  if (!sucursal) throw Errors.notFound('Sucursal no encontrada');

  const tipo = input.tipo as TipoMovimientoStock;
  const cantidadAbs = new Prisma.Decimal(String(input.cantidad));
  const esEntrada = ENTRADAS.includes(tipo);
  const cantidadSigned = esEntrada ? cantidadAbs : cantidadAbs.negated();

  return prisma.$transaction(async (tx) => {
    await tx.movimientoStock.create({
      data: {
        productoInventarioId: input.productoInventarioId,
        sucursalId: input.sucursalId,
        usuarioId: user.userId,
        tipo,
        cantidad: cantidadAbs,
        cantidadSigned,
        motivo: input.motivo,
      },
    });

    // Upsert del stock — si no existe, crear; si existe, sumar/restar
    const exist = await tx.stockSucursal.findUnique({
      where: {
        productoInventarioId_sucursalId: {
          productoInventarioId: input.productoInventarioId,
          sucursalId: input.sucursalId,
        },
      },
    });
    if (exist) {
      await tx.stockSucursal.update({
        where: { id: exist.id },
        data: { stockActual: { [esEntrada ? 'increment' : 'decrement']: cantidadAbs } },
      });
    } else {
      await tx.stockSucursal.create({
        data: {
          productoInventarioId: input.productoInventarioId,
          sucursalId: input.sucursalId,
          stockActual: cantidadSigned,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        empresaId: user.empresaId,
        sucursalId: input.sucursalId,
        usuarioId: user.userId,
        accion: 'AJUSTAR_STOCK',
        entidad: 'ProductoInventario',
        entidadId: input.productoInventarioId,
        metadata: {
          tipo,
          cantidad: cantidadAbs.toString(),
          motivo: input.motivo,
        },
      },
    });

    // Devolver stock actualizado
    return tx.stockSucursal.findUnique({
      where: {
        productoInventarioId_sucursalId: {
          productoInventarioId: input.productoInventarioId,
          sucursalId: input.sucursalId,
        },
      },
    });
  });
}

// ───── Set stock mínimo / máximo (config) ─────

export async function setStockLimites(empresaId: string, input: SetStockMinimosInput) {
  // Validar tenant
  const [insumo, sucursal] = await Promise.all([
    prisma.productoInventario.findFirst({
      where: { id: input.productoInventarioId, empresaId, deletedAt: null },
    }),
    prisma.sucursal.findFirst({ where: { id: input.sucursalId, empresaId, deletedAt: null } }),
  ]);
  if (!insumo) throw Errors.notFound('Insumo no encontrado');
  if (!sucursal) throw Errors.notFound('Sucursal no encontrada');

  return prisma.stockSucursal.upsert({
    where: {
      productoInventarioId_sucursalId: {
        productoInventarioId: input.productoInventarioId,
        sucursalId: input.sucursalId,
      },
    },
    create: {
      productoInventarioId: input.productoInventarioId,
      sucursalId: input.sucursalId,
      stockMinimo: input.stockMinimo ? String(input.stockMinimo) : 0,
      stockMaximo: input.stockMaximo ? String(input.stockMaximo) : null,
    },
    update: {
      ...(input.stockMinimo !== undefined ? { stockMinimo: String(input.stockMinimo) } : {}),
      ...(input.stockMaximo !== undefined ? { stockMaximo: String(input.stockMaximo) } : {}),
    },
  });
}
