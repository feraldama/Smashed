import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type {
  ActualizarCategoriaInput,
  ActualizarProductoInput,
  CrearCategoriaInput,
  CrearProductoInput,
  ListarProductosQuery,
  SetComboInput,
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
    // Por default ocultamos sub-preparaciones e items no vendibles (POS sólo
    // ve "lo que se vende"). Cuando el admin pide `incluirNoVendibles`, se
    // muestran todos para poder editarlos / verlos en /productos.
    ...(filtros.incluirNoVendibles ? {} : { esVendible: true, esPreparacion: false }),
    ...(filtros.categoriaId ? { categoriaId: filtros.categoriaId } : {}),
    ...(filtros.esCombo !== undefined ? { esCombo: filtros.esCombo } : {}),
    ...(filtros.busqueda ? buildBusquedaWhere(filtros.busqueda) : {}),
  };

  // Paginación opcional: si el caller manda pageSize, se aplica skip/take y se
  // calcula `total` (count del where). Si no, devuelve todos (uso del POS).
  const paginar = filtros.pageSize !== undefined;
  const page = filtros.page ?? 1;
  const pageSize = filtros.pageSize;

  const [productos, total] = await Promise.all([
    prisma.productoVenta.findMany({
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
        imagen: { select: { updatedAt: true } },
        sectorComanda: true,
        tiempoPrepSegundos: true,
        esCombo: true,
        esVendible: true,
        // Sólo necesitamos saber si tiene grupos vinculados (para que el POS
        // sepa si abrir el modal de configuración). Un count basta.
        _count: { select: { modificadorGrupos: true } },
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
      ...(pageSize !== undefined ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
    }),
    paginar ? prisma.productoVenta.count({ where }) : Promise.resolve(0),
  ]);

  const items = productos.map((p) => {
    const override = 'preciosSucursal' in p ? p.preciosSucursal[0]?.precio : undefined;
    const {
      preciosSucursal: _drop,
      _count,
      ...rest
    } = p as typeof p & { preciosSucursal?: unknown };
    void _drop;
    return {
      ...rest,
      precio: override ?? p.precioBase,
      precioBase: p.precioBase,
      tienePrecioSucursal: override !== undefined,
      tieneModificadores: _count.modificadorGrupos > 0,
    };
  });

  return {
    productos: items,
    total: paginar ? total : items.length,
    page,
    pageSize: pageSize ?? items.length,
  };
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
      imagen: { select: { updatedAt: true } },
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
            where: { deletedAt: null },
            orderBy: { orden: 'asc' },
            include: {
              opciones: {
                where: { deletedAt: null },
                orderBy: { orden: 'asc' },
                include: {
                  productoVenta: {
                    select: {
                      id: true,
                      codigo: true,
                      nombre: true,
                      imagenUrl: true,
                      imagen: { select: { updatedAt: true } },
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

  // El include de `combo` no filtra por deletedAt en el include 1:1; si quedó
  // soft-deleted (eliminarCombo) lo tratamos como inexistente para el cliente.
  const comboActivo = producto.combo && !producto.combo.deletedAt ? producto.combo : null;

  return {
    ...producto,
    combo: comboActivo,
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

  // Soft-delete cascada: la receta del producto también se marca como
  // deleted, así no queda "huérfana" bloqueando la eliminación de insumos
  // (`eliminarInsumo` filtra por receta.deletedAt IS NULL).
  const ahora = new Date();
  const [, productoActualizado] = await prisma.$transaction([
    prisma.receta.updateMany({
      where: { productoVentaId: id, deletedAt: null },
      data: { deletedAt: ahora },
    }),
    prisma.productoVenta.update({
      where: { id },
      data: { deletedAt: ahora, activo: false },
    }),
  ]);
  return productoActualizado;
}

// ═══════════════════════════════════════════════════════════════════════════
//  WRITE/READ — Imagen del producto (subida desde archivo, guardada en bytea)
// ═══════════════════════════════════════════════════════════════════════════

export async function setImagenProducto(args: {
  empresaId: string;
  productoId: string;
  bytes: Buffer;
  mime: string;
  width?: number;
  height?: number;
}) {
  const { empresaId, productoId, bytes, mime, width, height } = args;
  const prod = await prisma.productoVenta.findFirst({
    where: { id: productoId, empresaId, deletedAt: null },
    select: { id: true },
  });
  if (!prod) throw Errors.notFound('Producto no encontrado');

  // Prisma 7 espera Uint8Array<ArrayBuffer> (no SharedArrayBuffer). El Buffer
  // que multer entrega puede tener un ArrayBufferLike más amplio, así que
  // copiamos a un Uint8Array nuevo para satisfacer el tipo y desacoplar del
  // pool interno de Node.
  const data = new Uint8Array(bytes.byteLength);
  data.set(bytes);

  const imagen = await prisma.productoImagen.upsert({
    where: { productoVentaId: productoId },
    create: {
      productoVentaId: productoId,
      bytes: data,
      mime,
      size: data.byteLength,
      width,
      height,
    },
    update: { bytes: data, mime, size: data.byteLength, width, height },
    select: { updatedAt: true, mime: true, size: true },
  });

  return imagen;
}

export async function eliminarImagenProducto(empresaId: string, productoId: string) {
  const prod = await prisma.productoVenta.findFirst({
    where: { id: productoId, empresaId, deletedAt: null },
    select: { id: true },
  });
  if (!prod) throw Errors.notFound('Producto no encontrado');

  // deleteMany no falla si no existe — idempotente
  await prisma.productoImagen.deleteMany({ where: { productoVentaId: productoId } });
}

export async function obtenerImagenProducto(productoId: string) {
  // Lookup público: el CUID actúa como token opaco. Las fotos de productos
  // no son sensibles (catálogo público) y así podemos servirlas vía <img src>
  // sin tener que adjuntar el bearer token en cada request.
  const imagen = await prisma.productoImagen.findFirst({
    where: { productoVentaId: productoId, productoVenta: { deletedAt: null } },
    select: { bytes: true, mime: true, updatedAt: true },
  });
  return imagen;
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

// ═══════════════════════════════════════════════════════════════════════════
//  WRITE — Combo (grupos + opciones)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Reemplaza la configuración de combo de un producto.
 *
 * Estrategia: diff + soft delete. NO podemos hacer delete-recreate porque
 * `ItemPedidoComboOpcion` tiene FK Restrict a `combo_grupo` y
 * `combo_grupo_opcion` — borrar grupos/opciones referenciados por pedidos
 * históricos rompe la integridad. En vez de eso:
 *  - Hacemos match de grupos por `nombre` (case-insensitive) y de opciones
 *    por `productoVentaId` dentro del grupo (es la unique natural).
 *  - Lo que matchea, se actualiza in-place (resurrecta si estaba soft-deleted).
 *  - Lo que sobra, se marca `deletedAt = now()`. Las lecturas activas filtran
 *    `deletedAt: null`; los pedidos viejos siguen resolviendo el grupo/opción
 *    soft-deleted (la FK no filtra), preservando el historial.
 *
 * Validaciones:
 *  - Producto pertenece a la empresa.
 *  - Cada opción referencia un ProductoVenta de la misma empresa y NO combo.
 *  - Por grupo: ≤ 1 opción `esDefault`, sin productos repetidos.
 *  - Nombres de grupo únicos dentro del combo (necesario para el matching).
 */
export async function setCombo(empresaId: string, productoVentaId: string, input: SetComboInput) {
  const producto = await prisma.productoVenta.findFirst({
    where: { id: productoVentaId, empresaId, deletedAt: null },
    select: { id: true, esCombo: true },
  });
  if (!producto) throw Errors.notFound('Producto no encontrado');

  const nombresGrupo = input.grupos.map((g) => g.nombre.trim().toLowerCase());
  if (new Set(nombresGrupo).size !== nombresGrupo.length) {
    throw Errors.validation({ grupos: 'Hay nombres de grupo repetidos en el combo' });
  }

  for (const [i, g] of input.grupos.entries()) {
    const defaults = g.opciones.filter((o) => o.esDefault).length;
    if (defaults > 1) {
      throw Errors.validation({
        [`grupos.${i}.opciones`]: 'Solo una opción puede ser default por grupo',
      });
    }
    const productoIds = g.opciones.map((o) => o.productoVentaId);
    if (new Set(productoIds).size !== productoIds.length) {
      throw Errors.validation({
        [`grupos.${i}.opciones`]: 'Hay productos repetidos en el mismo grupo',
      });
    }
  }

  const opcionProductoIds = [
    ...new Set(input.grupos.flatMap((g) => g.opciones.map((o) => o.productoVentaId))),
  ];
  if (opcionProductoIds.includes(productoVentaId)) {
    throw Errors.validation({ opciones: 'El combo no puede contenerse a sí mismo como opción' });
  }
  const opcionesProductos = await prisma.productoVenta.findMany({
    where: { id: { in: opcionProductoIds }, empresaId, deletedAt: null },
    select: { id: true, nombre: true, esCombo: true },
  });
  if (opcionesProductos.length !== opcionProductoIds.length) {
    throw Errors.validation({ opciones: 'Algún producto opción no existe o no es de tu empresa' });
  }
  // Permitimos productos vendibles (ítems del menú a la carta), sub-preparaciones
  // (insumos intermedios) y productos exclusivos de combo (no vendibles solos).
  // El admin decide la categorización; si lo agregó al combo es porque tiene
  // sentido como componente. Lo único que sigue prohibido son los combos
  // anidados — eso sí es ambiguo de armar.
  const combosAnidados = opcionesProductos.filter((p) => p.esCombo).map((p) => p.id);
  if (combosAnidados.length > 0) {
    throw Errors.validation({
      opciones: `No se permiten combos anidados como opciones: ${combosAnidados.join(', ')}`,
    });
  }

  return prisma.$transaction(async (tx) => {
    if (!producto.esCombo) {
      await tx.productoVenta.update({
        where: { id: productoVentaId },
        data: { esCombo: true },
      });
    }

    // Upsert del Combo (resurrecta si estaba soft-deleted).
    const comboExistente = await tx.combo.findUnique({
      where: { productoVentaId },
      select: { id: true },
    });
    const combo = comboExistente
      ? await tx.combo.update({
          where: { id: comboExistente.id },
          data: { descripcion: input.descripcion, deletedAt: null },
          select: { id: true },
        })
      : await tx.combo.create({
          data: { empresaId, productoVentaId, descripcion: input.descripcion },
          select: { id: true },
        });

    // Cargo grupos existentes (incluye soft-deleted, para poder resurrectar
    // si el admin re-agrega un grupo con el mismo nombre).
    const gruposExistentes = await tx.comboGrupo.findMany({
      where: { comboId: combo.id },
      select: { id: true, nombre: true },
    });
    const grupoPorNombre = new Map(
      gruposExistentes.map((g) => [g.nombre.trim().toLowerCase(), g.id]),
    );
    const grupoIdsEnInput: string[] = [];

    for (const g of input.grupos) {
      const key = g.nombre.trim().toLowerCase();
      const existenteId = grupoPorNombre.get(key);
      const grupoId = existenteId
        ? (
            await tx.comboGrupo.update({
              where: { id: existenteId },
              data: {
                nombre: g.nombre,
                orden: g.orden,
                tipo: g.tipo,
                obligatorio: g.obligatorio,
                deletedAt: null,
              },
              select: { id: true },
            })
          ).id
        : (
            await tx.comboGrupo.create({
              data: {
                comboId: combo.id,
                nombre: g.nombre,
                orden: g.orden,
                tipo: g.tipo,
                obligatorio: g.obligatorio,
              },
              select: { id: true },
            })
          ).id;
      grupoIdsEnInput.push(grupoId);

      // Diff de opciones del grupo. La unique natural es (grupoId, productoVentaId).
      const opcionesExistentes = await tx.comboGrupoOpcion.findMany({
        where: { comboGrupoId: grupoId },
        select: { id: true, productoVentaId: true },
      });
      const opcionPorProducto = new Map(opcionesExistentes.map((o) => [o.productoVentaId, o.id]));
      const productosEnGrupo = new Set(g.opciones.map((o) => o.productoVentaId));

      for (const o of g.opciones) {
        const opcExistenteId = opcionPorProducto.get(o.productoVentaId);
        if (opcExistenteId) {
          await tx.comboGrupoOpcion.update({
            where: { id: opcExistenteId },
            data: {
              precioExtra: o.precioExtra,
              esDefault: o.esDefault,
              orden: o.orden,
              deletedAt: null,
            },
          });
        } else {
          await tx.comboGrupoOpcion.create({
            data: {
              comboGrupoId: grupoId,
              productoVentaId: o.productoVentaId,
              precioExtra: o.precioExtra,
              esDefault: o.esDefault,
              orden: o.orden,
            },
          });
        }
      }

      // Soft-delete de opciones que ya no están en el input y siguen activas.
      await tx.comboGrupoOpcion.updateMany({
        where: {
          comboGrupoId: grupoId,
          deletedAt: null,
          productoVentaId: { notIn: [...productosEnGrupo] },
        },
        data: { deletedAt: new Date() },
      });
    }

    // Soft-delete de grupos que ya no están en el input + sus opciones activas.
    const gruposASoftDelete = await tx.comboGrupo.findMany({
      where: {
        comboId: combo.id,
        deletedAt: null,
        id: { notIn: grupoIdsEnInput },
      },
      select: { id: true },
    });
    if (gruposASoftDelete.length > 0) {
      const ids = gruposASoftDelete.map((g) => g.id);
      const ahora = new Date();
      await tx.comboGrupoOpcion.updateMany({
        where: { comboGrupoId: { in: ids }, deletedAt: null },
        data: { deletedAt: ahora },
      });
      await tx.comboGrupo.updateMany({
        where: { id: { in: ids } },
        data: { deletedAt: ahora },
      });
    }

    return tx.combo.findUnique({
      where: { productoVentaId },
      include: {
        grupos: {
          where: { deletedAt: null },
          orderBy: { orden: 'asc' },
          include: {
            opciones: {
              where: { deletedAt: null },
              orderBy: { orden: 'asc' },
              include: {
                productoVenta: {
                  select: {
                    id: true,
                    codigo: true,
                    nombre: true,
                    precioBase: true,
                    imagenUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  });
}

export async function eliminarCombo(empresaId: string, productoVentaId: string) {
  const producto = await prisma.productoVenta.findFirst({
    where: { id: productoVentaId, empresaId, deletedAt: null },
    select: { id: true, esCombo: true },
  });
  if (!producto) throw Errors.notFound('Producto no encontrado');

  // Soft delete del árbol completo. No podemos hard-delete porque los grupos /
  // opciones pueden estar referenciados por pedidos históricos (FK Restrict).
  return prisma.$transaction(async (tx) => {
    const combo = await tx.combo.findUnique({
      where: { productoVentaId },
      select: { id: true, deletedAt: true },
    });
    if (combo && !combo.deletedAt) {
      const ahora = new Date();
      await tx.comboGrupoOpcion.updateMany({
        where: { comboGrupo: { comboId: combo.id }, deletedAt: null },
        data: { deletedAt: ahora },
      });
      await tx.comboGrupo.updateMany({
        where: { comboId: combo.id, deletedAt: null },
        data: { deletedAt: ahora },
      });
      await tx.combo.update({ where: { id: combo.id }, data: { deletedAt: ahora } });
    }
    if (producto.esCombo) {
      await tx.productoVenta.update({
        where: { id: productoVentaId },
        data: { esCombo: false },
      });
    }
  });
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
    const actual = cola.shift();
    if (!actual) break;
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
