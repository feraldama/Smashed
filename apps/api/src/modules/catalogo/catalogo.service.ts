
import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type {
  ActualizarCategoriaInput,
  ActualizarProductoInput,
  CrearCategoriaInput,
  CrearProductoInput,
  ListarProductosQuery,
  SetPrecioSucursalInput,
  SetRecetaInput,
} from './catalogo.schemas.js';
import type { Prisma } from '@prisma/client';

/**
 * Servicio de catálogo (lectura).
 *
 * Filtrado multi-tenant: SIEMPRE pasamos `empresaId` explícito al where.
 * Si el usuario tiene sucursal activa, aplicamos override de precio
 * (PrecioPorSucursal vigente) sobre `precioBase`.
 */

export async function listarCategorias(empresaId: string) {
  const categorias = await prisma.categoriaProductoEmpresa.findMany({
    where: { empresaId, deletedAt: null, activa: true },
    select: {
      id: true,
      nombre: true,
      categoriaBase: true,
      ordenMenu: true,
      iconoUrl: true,
      _count: {
        select: { productosVenta: { where: { deletedAt: null, activo: true, esVendible: true } } },
      },
    },
    orderBy: [{ ordenMenu: 'asc' }, { nombre: 'asc' }],
  });

  return categorias.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    categoriaBase: c.categoriaBase,
    ordenMenu: c.ordenMenu,
    iconoUrl: c.iconoUrl,
    totalProductos: c._count.productosVenta,
  }));
}

export async function listarProductos(args: {
  empresaId: string;
  sucursalId: string | null;
  filtros: ListarProductosQuery;
}) {
  const { empresaId, sucursalId, filtros } = args;
  const ahora = new Date();

  const where: Prisma.ProductoVentaWhereInput = {
    empresaId,
    deletedAt: null,
    activo: true,
    esPreparacion: false, // no exponemos sub-preparaciones al POS
    ...(filtros.incluirNoVendibles ? {} : { esVendible: true }),
    ...(filtros.categoriaId ? { categoriaId: filtros.categoriaId } : {}),
    ...(filtros.esCombo !== undefined ? { esCombo: filtros.esCombo } : {}),
    ...(filtros.busqueda ? buildBusquedaWhere(filtros.busqueda) : {}),
  };

  const productos = await prisma.productoVenta.findMany({
    where,
    select: {
      id: true,
      codigo: true,
      codigoBarras: true,
      nombre: true,
      descripcion: true,
      precioBase: true,
      tasaIva: true,
      imagenUrl: true,
      sectorComanda: true,
      tiempoPrepSegundos: true,
      esCombo: true,
      esVendible: true,
      categoria: { select: { id: true, nombre: true, categoriaBase: true } },
      ...(sucursalId
        ? {
            preciosSucursal: {
              where: {
                sucursalId,
                vigenteDesde: { lte: ahora },
                OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }],
              },
              orderBy: { vigenteDesde: 'desc' },
              take: 1,
              select: { precio: true },
            },
          }
        : {}),
    },
    orderBy: [{ categoria: { ordenMenu: 'asc' } }, { nombre: 'asc' }],
  });

  return productos.map((p) => {
    const override = 'preciosSucursal' in p ? p.preciosSucursal[0]?.precio : undefined;
    const { preciosSucursal: _drop, ...rest } = p as typeof p & { preciosSucursal?: unknown };
    void _drop;
    return {
      ...rest,
      precio: override ?? p.precioBase,
      precioBase: p.precioBase,
      tienePrecioSucursal: override !== undefined,
    };
  });
}

export async function obtenerProducto(args: {
  empresaId: string;
  sucursalId: string | null;
  id: string;
}) {
  const { empresaId, sucursalId, id } = args;
  const ahora = new Date();

  const producto = await prisma.productoVenta.findFirst({
    where: { id, empresaId, deletedAt: null },
    include: {
      categoria: { select: { id: true, nombre: true, categoriaBase: true } },
      receta: {
        include: {
          items: {
            include: {
              insumo: { select: { id: true, nombre: true, unidadMedida: true } },
              subProducto: { select: { id: true, nombre: true, esPreparacion: true } },
            },
          },
        },
      },
      combo: {
        include: {
          grupos: {
            orderBy: { orden: 'asc' },
            include: {
              opciones: {
                orderBy: { orden: 'asc' },
                include: {
                  productoVenta: {
                    select: {
                      id: true,
                      codigo: true,
                      nombre: true,
                      imagenUrl: true,
                      precioBase: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      modificadorGrupos: {
        orderBy: { ordenEnProducto: 'asc' },
        include: {
          modificadorGrupo: {
            include: {
              opciones: {
                where: { activo: true },
                orderBy: { orden: 'asc' },
              },
            },
          },
        },
      },
      ...(sucursalId
        ? {
            preciosSucursal: {
              where: {
                sucursalId,
                vigenteDesde: { lte: ahora },
                OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }],
              },
              orderBy: { vigenteDesde: 'desc' },
              take: 1,
              select: { precio: true },
            },
          }
        : {}),
    },
  });

  if (!producto) throw Errors.notFound('Producto no encontrado');

  const override =
    'preciosSucursal' in producto && Array.isArray(producto.preciosSucursal)
      ? producto.preciosSucursal[0]?.precio
      : undefined;

  return {
    ...producto,
    precio: override ?? producto.precioBase,
    tienePrecioSucursal: override !== undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  WRITE — Categorías
// ═══════════════════════════════════════════════════════════════════════════

export async function crearCategoria(empresaId: string, input: CrearCategoriaInput) {
  return prisma.categoriaProductoEmpresa.create({
    data: { empresaId, ...input },
  });
}

export async function actualizarCategoria(
  empresaId: string,
  id: string,
  input: ActualizarCategoriaInput,
) {
  // Verificar que pertenece a la empresa
  const cat = await prisma.categoriaProductoEmpresa.findFirst({
    where: { id, empresaId, deletedAt: null },
  });
  if (!cat) throw Errors.notFound('Categoría no encontrada');

  return prisma.categoriaProductoEmpresa.update({
    where: { id },
    data: input,
  });
}

export async function eliminarCategoria(empresaId: string, id: string) {
  const cat = await prisma.categoriaProductoEmpresa.findFirst({
    where: { id, empresaId, deletedAt: null },
    include: {
      _count: { select: { productosVenta: { where: { deletedAt: null } } } },
    },
  });
  if (!cat) throw Errors.notFound('Categoría no encontrada');
  if (cat._count.productosVenta > 0) {
    throw Errors.conflict(
      `No se puede eliminar — tiene ${cat._count.productosVenta} producto(s). Reasignalos primero.`,
    );
  }

  return prisma.categoriaProductoEmpresa.update({
    where: { id },
    data: { deletedAt: new Date(), activa: false },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  WRITE — Productos de venta
// ═══════════════════════════════════════════════════════════════════════════

export async function crearProducto(empresaId: string, input: CrearProductoInput) {
  // Validar que la categoría (si viene) pertenece a la empresa
  if (input.categoriaId) {
    const cat = await prisma.categoriaProductoEmpresa.findFirst({
      where: { id: input.categoriaId, empresaId, deletedAt: null },
    });
    if (!cat) throw Errors.validation({ categoriaId: 'no encontrada' });
  }

  return prisma.productoVenta.create({
    data: { empresaId, ...input },
    include: { categoria: { select: { id: true, nombre: true } } },
  });
}

export async function actualizarProducto(
  empresaId: string,
  id: string,
  input: ActualizarProductoInput,
) {
  const prod = await prisma.productoVenta.findFirst({
    where: { id, empresaId, deletedAt: null },
  });
  if (!prod) throw Errors.notFound('Producto no encontrado');

  if (input.categoriaId) {
    const cat = await prisma.categoriaProductoEmpresa.findFirst({
      where: { id: input.categoriaId, empresaId, deletedAt: null },
    });
    if (!cat) throw Errors.validation({ categoriaId: 'no encontrada' });
  }

  return prisma.productoVenta.update({
    where: { id },
    data: input,
    include: { categoria: { select: { id: true, nombre: true } } },
  });
}

export async function eliminarProducto(empresaId: string, id: string) {
  const prod = await prisma.productoVenta.findFirst({
    where: { id, empresaId, deletedAt: null },
  });
  if (!prod) throw Errors.notFound('Producto no encontrado');

  return prisma.productoVenta.update({
    where: { id },
    data: { deletedAt: new Date(), activo: false },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  WRITE — Precio por sucursal (override)
// ═══════════════════════════════════════════════════════════════════════════

export async function setPrecioSucursal(
  empresaId: string,
  productoId: string,
  input: SetPrecioSucursalInput,
) {
  // Validar producto + sucursal pertenecen a la empresa
  const [prod, sucursal] = await Promise.all([
    prisma.productoVenta.findFirst({
      where: { id: productoId, empresaId, deletedAt: null },
      select: { id: true },
    }),
    prisma.sucursal.findFirst({
      where: { id: input.sucursalId, empresaId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!prod) throw Errors.notFound('Producto no encontrado');
  if (!sucursal) throw Errors.validation({ sucursalId: 'no encontrada' });

  const vigenteDesde = input.vigenteDesde ?? new Date();

  // Cerrar precio vigente anterior (si existe)
  await prisma.precioPorSucursal.updateMany({
    where: {
      productoVentaId: productoId,
      sucursalId: input.sucursalId,
      vigenteHasta: null,
    },
    data: { vigenteHasta: vigenteDesde },
  });

  return prisma.precioPorSucursal.create({
    data: {
      productoVentaId: productoId,
      sucursalId: input.sucursalId,
      precio: input.precio,
      vigenteDesde,
      vigenteHasta: input.vigenteHasta,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  WRITE — Receta (BOM)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Reemplaza la receta completa de un producto.
 *
 * Validaciones:
 *  - Producto pertenece a la empresa
 *  - Cada insumo (productoInventarioId) pertenece a la empresa
 *  - Cada sub-producto (subProductoVentaId) pertenece a la empresa
 *  - **Detección de ciclos** vía DFS sobre los sub-productos referenciados
 *  - Operación atómica (borra items existentes + crea nuevos en una sola transacción)
 */
export async function setReceta(empresaId: string, productoVentaId: string, input: SetRecetaInput) {
  const producto = await prisma.productoVenta.findFirst({
    where: { id: productoVentaId, empresaId, deletedAt: null },
  });
  if (!producto) throw Errors.notFound('Producto no encontrado');

  const insumoIds = [
    ...new Set(input.items.map((i) => i.productoInventarioId).filter(Boolean) as string[]),
  ];
  const subProdIds = [
    ...new Set(input.items.map((i) => i.subProductoVentaId).filter(Boolean) as string[]),
  ];

  if (insumoIds.length > 0) {
    const found = await prisma.productoInventario.count({
      where: { id: { in: insumoIds }, empresaId, deletedAt: null },
    });
    if (found !== insumoIds.length) {
      throw Errors.validation({ insumos: 'Algún insumo no existe o no pertenece a tu empresa' });
    }
  }

  if (subProdIds.length > 0) {
    if (subProdIds.includes(productoVentaId)) {
      throw Errors.validation({ subProducto: 'Un producto no puede ser sub-receta de sí mismo' });
    }
    const subs = await prisma.productoVenta.findMany({
      where: { id: { in: subProdIds }, empresaId, deletedAt: null },
      select: { id: true },
    });
    if (subs.length !== subProdIds.length) {
      throw Errors.validation({ subProducto: 'Algún sub-producto no existe' });
    }

    await assertSinCiclos(productoVentaId, subProdIds, empresaId);
  }

  return prisma.$transaction(async (tx) => {
    const existente = await tx.receta.findUnique({
      where: { productoVentaId },
      select: { id: true },
    });
    if (existente) {
      await tx.itemReceta.deleteMany({ where: { recetaId: existente.id } });
      await tx.receta.update({
        where: { id: existente.id },
        data: {
          rinde: String(input.rinde),
          notas: input.notas,
          items: {
            create: input.items.map((it) => ({
              productoInventarioId: it.productoInventarioId,
              subProductoVentaId: it.subProductoVentaId,
              cantidad: String(it.cantidad),
              unidadMedida: it.unidadMedida,
              esOpcional: it.esOpcional,
              notas: it.notas,
            })),
          },
        },
      });
    } else {
      await tx.receta.create({
        data: {
          empresaId,
          productoVentaId,
          rinde: String(input.rinde),
          notas: input.notas,
          items: {
            create: input.items.map((it) => ({
              productoInventarioId: it.productoInventarioId,
              subProductoVentaId: it.subProductoVentaId,
              cantidad: String(it.cantidad),
              unidadMedida: it.unidadMedida,
              esOpcional: it.esOpcional,
              notas: it.notas,
            })),
          },
        },
      });
    }

    return tx.receta.findUnique({
      where: { productoVentaId },
      include: {
        items: {
          include: {
            insumo: { select: { id: true, nombre: true, unidadMedida: true, codigo: true } },
            subProducto: { select: { id: true, nombre: true, codigo: true, esPreparacion: true } },
          },
        },
      },
    });
  });
}

export async function eliminarReceta(empresaId: string, productoVentaId: string) {
  const producto = await prisma.productoVenta.findFirst({
    where: { id: productoVentaId, empresaId, deletedAt: null },
  });
  if (!producto) throw Errors.notFound('Producto no encontrado');

  const receta = await prisma.receta.findUnique({
    where: { productoVentaId },
    select: { id: true },
  });
  if (!receta) return;

  const usadoEn = await prisma.itemReceta.count({
    where: { subProductoVentaId: productoVentaId },
  });
  if (usadoEn > 0) {
    throw Errors.conflict(
      `No se puede eliminar la receta — este producto es sub-receta de ${usadoEn} otra(s) receta(s).`,
    );
  }

  await prisma.itemReceta.deleteMany({ where: { recetaId: receta.id } });
  await prisma.receta.delete({ where: { id: receta.id } });
}

/**
 * DFS: para cada sub-producto candidato, expande sus dependencias y verifica
 * que NO contengan al producto raíz.
 */
async function assertSinCiclos(
  productoRaizId: string,
  subProductosACheckear: string[],
  empresaId: string,
) {
  const visitados = new Set<string>();
  const cola = [...subProductosACheckear];

  while (cola.length > 0) {
    const actual = cola.shift()!;
    if (visitados.has(actual)) continue;
    visitados.add(actual);

    if (actual === productoRaizId) {
      throw Errors.validation({
        subProducto:
          'Ciclo detectado — un sub-producto referencia transitivamente al producto principal',
      });
    }

    const items = await prisma.itemReceta.findMany({
      where: {
        receta: { productoVentaId: actual, empresaId },
        subProductoVentaId: { not: null },
      },
      select: { subProductoVentaId: true },
    });

    for (const it of items) {
      if (it.subProductoVentaId && !visitados.has(it.subProductoVentaId)) {
        cola.push(it.subProductoVentaId);
      }
    }
  }
}

// ───── helpers ─────

function buildBusquedaWhere(busqueda: string): Prisma.ProductoVentaWhereInput {
  const term = busqueda.trim();
  if (/^\d{8,}$/.test(term)) {
    return { codigoBarras: term };
  }
  return {
    OR: [
      { nombre: { contains: term, mode: 'insensitive' } },
      { codigo: { contains: term, mode: 'insensitive' } },
      { codigoBarras: term },
    ],
  };
}
