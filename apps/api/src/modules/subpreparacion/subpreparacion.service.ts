import { ModoStockReceta, Prisma, TipoMovimientoStock, type Rol } from '@prisma/client';

import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { expandirReceta } from '../pedido/stock-recursivo.js';

import type {
  CambiarModoStockInput,
  ListarSubpreparacionesQuery,
  ProducirLoteInput,
} from './subpreparacion.schemas.js';

interface UserCtx {
  userId: string;
  empresaId: string | null;
  rol: Rol;
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

async function getSubpreparacionOwned(empresaId: string, productoVentaId: string) {
  const subprep = await prisma.productoVenta.findFirst({
    where: { id: productoVentaId, empresaId, deletedAt: null, esPreparacion: true },
    include: {
      receta: {
        include: {
          productoInventarioEspejo: {
            select: { id: true, nombre: true, codigo: true, unidadMedida: true },
          },
        },
      },
    },
  });
  if (!subprep) throw Errors.notFound('Sub-preparación no encontrada');
  return subprep;
}

// ═════════════════════════════════════════════════════════════════════════
//  LISTAR
// ═════════════════════════════════════════════════════════════════════════

export async function listarSubpreparaciones(user: UserCtx, q: ListarSubpreparacionesQuery) {
  const empresaId = requireEmpresa(user);

  const subpreps = await prisma.productoVenta.findMany({
    where: {
      empresaId,
      deletedAt: null,
      esPreparacion: true,
      ...(q.busqueda ? { nombre: { contains: q.busqueda, mode: 'insensitive' } } : {}),
    },
    orderBy: { nombre: 'asc' },
    include: {
      receta: {
        select: {
          id: true,
          rinde: true,
          unidadRinde: true,
          modoStock: true,
          productoInventarioId: true,
          productoInventarioEspejo: {
            select: {
              id: true,
              nombre: true,
              codigo: true,
              unidadMedida: true,
              stockSucursal: q.sucursalId
                ? {
                    where: { sucursalId: q.sucursalId },
                    select: { sucursalId: true, stockActual: true, stockMinimo: true },
                  }
                : {
                    select: {
                      sucursalId: true,
                      stockActual: true,
                      stockMinimo: true,
                      sucursal: { select: { id: true, nombre: true } },
                    },
                  },
            },
          },
          items: {
            select: {
              id: true,
              cantidad: true,
              unidadMedida: true,
              esOpcional: true,
              insumo: { select: { id: true, nombre: true, unidadMedida: true } },
              subProducto: { select: { id: true, nombre: true } },
            },
          },
        },
      },
    },
  });

  return subpreps;
}

// ═════════════════════════════════════════════════════════════════════════
//  CAMBIAR MODO DE STOCK
// ═════════════════════════════════════════════════════════════════════════

export async function cambiarModoStock(
  user: UserCtx,
  productoVentaId: string,
  input: CambiarModoStockInput,
) {
  const empresaId = requireEmpresa(user);
  const subprep = await getSubpreparacionOwned(empresaId, productoVentaId);

  if (!subprep.receta) {
    throw Errors.conflict(
      'La sub-preparación no tiene receta — definí los ingredientes antes de cambiar el modo de stock',
    );
  }

  if (input.modoStock === ModoStockReceta.CALCULADA) {
    // Volver a CALCULADA: limpiar vínculo (no borrar el PI espejo, puede tener
    // stock e histórico de movimientos que conviene preservar).
    return prisma.receta.update({
      where: { id: subprep.receta.id },
      data: { modoStock: ModoStockReceta.CALCULADA, productoInventarioId: null },
      include: {
        productoInventarioEspejo: {
          select: { id: true, nombre: true, codigo: true, unidadMedida: true },
        },
      },
    });
  }

  // Pasar a LOTE
  let productoInventarioId: string;

  if (input.productoInventarioId) {
    // Vincular a un PI existente de la misma empresa.
    const pi = await prisma.productoInventario.findFirst({
      where: { id: input.productoInventarioId, empresaId, deletedAt: null },
      select: { id: true },
    });
    if (!pi) throw Errors.notFound('Producto de inventario espejo no encontrado');
    productoInventarioId = pi.id;
  } else if (subprep.receta.productoInventarioId) {
    // Reutilizar el espejo previo si volvió a CALCULADA y ahora vuelve a LOTE.
    productoInventarioId = subprep.receta.productoInventarioId;
  } else {
    // Crear PI espejo automático. Si no se especifica unidad, usar la
    // `unidadRinde` de la receta — así el stock del espejo queda en la misma
    // unidad en la que la receta produce (ej. mayonesa rinde 1000 MILILITRO →
    // espejo en mililitros).
    const piNuevo = await prisma.productoInventario.create({
      data: {
        empresaId,
        nombre: subprep.nombre,
        unidadMedida: input.unidadMedidaEspejo ?? subprep.receta.unidadRinde,
        descripcion: `Espejo de sub-preparación "${subprep.nombre}" (modo LOTE)`,
      },
      select: { id: true },
    });
    productoInventarioId = piNuevo.id;
  }

  return prisma.receta.update({
    where: { id: subprep.receta.id },
    data: { modoStock: ModoStockReceta.LOTE, productoInventarioId },
    include: {
      productoInventarioEspejo: {
        select: { id: true, nombre: true, codigo: true, unidadMedida: true },
      },
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════
//  PRODUCIR LOTE
// ═════════════════════════════════════════════════════════════════════════

export async function producirLote(
  user: UserCtx,
  productoVentaId: string,
  input: ProducirLoteInput,
) {
  const empresaId = requireEmpresa(user);
  const subprep = await getSubpreparacionOwned(empresaId, productoVentaId);

  if (!subprep.receta) {
    throw Errors.conflict('La sub-preparación no tiene receta');
  }
  if (subprep.receta.modoStock !== ModoStockReceta.LOTE || !subprep.receta.productoInventarioId) {
    throw Errors.conflict(
      'La sub-preparación no está en modo LOTE — cambiá el modo de stock antes de producir',
    );
  }

  // Validar que la sucursal pertenece a la empresa
  const sucursal = await prisma.sucursal.findFirst({
    where: { id: input.sucursalId, empresaId, deletedAt: null },
    select: { id: true },
  });
  if (!sucursal) throw Errors.notFound('Sucursal no encontrada');

  const espejoId = subprep.receta.productoInventarioId;
  const cantidadDec = new Prisma.Decimal(input.cantidad.toFixed(3));

  return prisma.$transaction(async (tx) => {
    // Expandir receta a insumos crudos (ignorando modo LOTE de la raíz —
    // queremos consumir los insumos para "fabricar" el lote).
    const consumoInsumos = await expandirReceta(tx, productoVentaId, input.cantidad, {
      ignorarModoLoteRaiz: true,
    });

    const motivo =
      `Producción lote sub-prep "${subprep.nombre}" — ${input.cantidad}` +
      (input.notas ? ` — ${input.notas}` : '');

    // 1) Descontar cada insumo crudo (SALIDA_CONSUMO_INTERNO)
    for (const [insumoId, cant] of consumoInsumos) {
      // Si el espejo es uno de los insumos consumidos, sería un ciclo. Cortamos.
      if (insumoId === espejoId) {
        throw Errors.conflict(
          'Ciclo en receta: la sub-preparación se referencia a sí misma como insumo',
        );
      }
      const cantInsumo = new Prisma.Decimal(cant.toFixed(3));

      await tx.movimientoStock.create({
        data: {
          productoInventarioId: insumoId,
          sucursalId: input.sucursalId,
          usuarioId: user.userId,
          tipo: TipoMovimientoStock.SALIDA_CONSUMO_INTERNO,
          cantidad: cantInsumo,
          cantidadSigned: cantInsumo.negated(),
          motivo,
        },
      });

      const upd = await tx.stockSucursal.updateMany({
        where: { productoInventarioId: insumoId, sucursalId: input.sucursalId },
        data: { stockActual: { decrement: cantInsumo } },
      });
      if (upd.count === 0) {
        await tx.stockSucursal.create({
          data: {
            productoInventarioId: insumoId,
            sucursalId: input.sucursalId,
            stockActual: cantInsumo.negated(),
          },
        });
      }
    }

    // 2) Sumar al espejo (ENTRADA_PRODUCCION)
    await tx.movimientoStock.create({
      data: {
        productoInventarioId: espejoId,
        sucursalId: input.sucursalId,
        usuarioId: user.userId,
        tipo: TipoMovimientoStock.ENTRADA_PRODUCCION,
        cantidad: cantidadDec,
        cantidadSigned: cantidadDec,
        motivo,
      },
    });

    const updEspejo = await tx.stockSucursal.updateMany({
      where: { productoInventarioId: espejoId, sucursalId: input.sucursalId },
      data: { stockActual: { increment: cantidadDec } },
    });
    if (updEspejo.count === 0) {
      await tx.stockSucursal.create({
        data: {
          productoInventarioId: espejoId,
          sucursalId: input.sucursalId,
          stockActual: cantidadDec,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        empresaId,
        sucursalId: input.sucursalId,
        usuarioId: user.userId,
        accion: 'CREAR',
        entidad: 'ProduccionLote',
        entidadId: productoVentaId,
        metadata: {
          subpreparacion: subprep.nombre,
          cantidad: input.cantidad,
          insumos_consumidos: consumoInsumos.size,
          espejo: espejoId,
        },
      },
    });

    return {
      productoVentaId,
      sucursalId: input.sucursalId,
      cantidadProducida: input.cantidad,
      insumosConsumidos: consumoInsumos.size,
    };
  });
}
