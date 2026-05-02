import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type {
  ActualizarGrupoInput,
  ActualizarOpcionInput,
  CrearGrupoInput,
  CrearOpcionInput,
  VincularProductoInput,
} from './modificador.schemas.js';

interface UserCtx {
  empresaId: string | null;
  isSuperAdmin: boolean;
}

function requireEmpresa(user: UserCtx): string {
  if (user.isSuperAdmin && !user.empresaId) {
    throw Errors.forbidden('SUPER_ADMIN debe operar en una empresa específica');
  }
  if (!user.empresaId) throw Errors.unauthorized();
  return user.empresaId;
}

async function getGrupoOwned(empresaId: string, grupoId: string) {
  const grupo = await prisma.modificadorGrupo.findFirst({
    where: { id: grupoId, empresaId, deletedAt: null },
  });
  if (!grupo) throw Errors.notFound('Grupo de modificadores no encontrado');
  return grupo;
}

// ═════════════════════════════════════════════════════════════════════════
//  GRUPOS
// ═════════════════════════════════════════════════════════════════════════

export async function listarGrupos(user: UserCtx, q: { busqueda?: string }) {
  const empresaId = requireEmpresa(user);
  const grupos = await prisma.modificadorGrupo.findMany({
    where: {
      empresaId,
      deletedAt: null,
      ...(q.busqueda ? { nombre: { contains: q.busqueda, mode: 'insensitive' } } : {}),
    },
    orderBy: { nombre: 'asc' },
    include: {
      opciones: { orderBy: { orden: 'asc' } },
      _count: { select: { productosVentaAplicados: true } },
    },
  });
  return grupos;
}

export async function obtenerGrupo(user: UserCtx, grupoId: string) {
  const empresaId = requireEmpresa(user);
  const grupo = await prisma.modificadorGrupo.findFirst({
    where: { id: grupoId, empresaId, deletedAt: null },
    include: {
      opciones: { orderBy: { orden: 'asc' } },
      productosVentaAplicados: {
        include: {
          productoVenta: { select: { id: true, codigo: true, nombre: true } },
        },
      },
    },
  });
  if (!grupo) throw Errors.notFound('Grupo de modificadores no encontrado');
  return grupo;
}

export async function crearGrupo(user: UserCtx, input: CrearGrupoInput) {
  const empresaId = requireEmpresa(user);

  const dup = await prisma.modificadorGrupo.findFirst({
    where: { empresaId, nombre: input.nombre, deletedAt: null },
  });
  if (dup) throw Errors.conflict(`Ya existe un grupo "${input.nombre}"`);

  return prisma.modificadorGrupo.create({
    data: {
      empresaId,
      nombre: input.nombre,
      tipo: input.tipo,
      obligatorio: input.obligatorio,
      minSeleccion: input.minSeleccion,
      maxSeleccion: input.maxSeleccion ?? null,
      ...(input.opciones && input.opciones.length > 0
        ? {
            opciones: {
              create: input.opciones.map((o, idx) => ({
                nombre: o.nombre,
                precioExtra: BigInt(o.precioExtra ?? 0),
                orden: o.orden ?? idx + 1,
                activo: o.activo ?? true,
              })),
            },
          }
        : {}),
    },
    include: { opciones: { orderBy: { orden: 'asc' } } },
  });
}

export async function actualizarGrupo(user: UserCtx, grupoId: string, input: ActualizarGrupoInput) {
  const empresaId = requireEmpresa(user);
  const grupo = await getGrupoOwned(empresaId, grupoId);

  if (input.nombre && input.nombre !== grupo.nombre) {
    const dup = await prisma.modificadorGrupo.findFirst({
      where: { empresaId, nombre: input.nombre, deletedAt: null, id: { not: grupoId } },
    });
    if (dup) throw Errors.conflict(`Ya existe un grupo "${input.nombre}"`);
  }

  return prisma.modificadorGrupo.update({
    where: { id: grupoId },
    data: input,
    include: { opciones: { orderBy: { orden: 'asc' } } },
  });
}

export async function eliminarGrupo(user: UserCtx, grupoId: string) {
  const empresaId = requireEmpresa(user);
  await getGrupoOwned(empresaId, grupoId);
  // Soft delete + desvincular de productos (no toca histórico de pedidos).
  await prisma.$transaction([
    prisma.productoVentaModificadorGrupo.deleteMany({
      where: { modificadorGrupoId: grupoId },
    }),
    prisma.modificadorGrupo.update({
      where: { id: grupoId },
      data: { deletedAt: new Date() },
    }),
  ]);
}

// ═════════════════════════════════════════════════════════════════════════
//  OPCIONES
// ═════════════════════════════════════════════════════════════════════════

export async function crearOpcion(user: UserCtx, grupoId: string, input: CrearOpcionInput) {
  const empresaId = requireEmpresa(user);
  await getGrupoOwned(empresaId, grupoId);

  return prisma.modificadorOpcion.create({
    data: {
      modificadorGrupoId: grupoId,
      nombre: input.nombre,
      precioExtra: BigInt(input.precioExtra ?? 0),
      orden: input.orden ?? 0,
      activo: input.activo ?? true,
    },
  });
}

export async function actualizarOpcion(
  user: UserCtx,
  grupoId: string,
  opcionId: string,
  input: ActualizarOpcionInput,
) {
  const empresaId = requireEmpresa(user);
  await getGrupoOwned(empresaId, grupoId);

  const opcion = await prisma.modificadorOpcion.findFirst({
    where: { id: opcionId, modificadorGrupoId: grupoId },
  });
  if (!opcion) throw Errors.notFound('Opción no encontrada');

  return prisma.modificadorOpcion.update({
    where: { id: opcionId },
    data: {
      ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
      ...(input.precioExtra !== undefined ? { precioExtra: BigInt(input.precioExtra) } : {}),
      ...(input.orden !== undefined ? { orden: input.orden } : {}),
      ...(input.activo !== undefined ? { activo: input.activo } : {}),
    },
  });
}

export async function eliminarOpcion(user: UserCtx, grupoId: string, opcionId: string) {
  const empresaId = requireEmpresa(user);
  await getGrupoOwned(empresaId, grupoId);

  const opcion = await prisma.modificadorOpcion.findFirst({
    where: { id: opcionId, modificadorGrupoId: grupoId },
    include: { _count: { select: { itemsPedidoMod: true } } },
  });
  if (!opcion) throw Errors.notFound('Opción no encontrada');

  if (opcion._count.itemsPedidoMod > 0) {
    // Tiene historial — no se puede borrar; sugerimos desactivar.
    throw Errors.conflict(
      `No se puede eliminar — la opción se usó en ${opcion._count.itemsPedidoMod} pedido(s). Desactivala con activo=false.`,
    );
  }

  await prisma.modificadorOpcion.delete({ where: { id: opcionId } });
}

// ═════════════════════════════════════════════════════════════════════════
//  VINCULACIÓN PRODUCTO ↔ GRUPO
// ═════════════════════════════════════════════════════════════════════════

export async function vincularProducto(
  user: UserCtx,
  grupoId: string,
  input: VincularProductoInput,
) {
  const empresaId = requireEmpresa(user);
  await getGrupoOwned(empresaId, grupoId);

  // Producto debe ser de la misma empresa
  const prod = await prisma.productoVenta.findFirst({
    where: { id: input.productoVentaId, empresaId, deletedAt: null },
    select: { id: true },
  });
  if (!prod) throw Errors.notFound('Producto no encontrado');

  return prisma.productoVentaModificadorGrupo.upsert({
    where: {
      productoVentaId_modificadorGrupoId: {
        productoVentaId: prod.id,
        modificadorGrupoId: grupoId,
      },
    },
    create: {
      productoVentaId: prod.id,
      modificadorGrupoId: grupoId,
      ordenEnProducto: input.ordenEnProducto ?? 0,
    },
    update: { ordenEnProducto: input.ordenEnProducto ?? 0 },
  });
}

export async function desvincularProducto(user: UserCtx, grupoId: string, productoVentaId: string) {
  const empresaId = requireEmpresa(user);
  await getGrupoOwned(empresaId, grupoId);

  const link = await prisma.productoVentaModificadorGrupo.findUnique({
    where: {
      productoVentaId_modificadorGrupoId: { productoVentaId, modificadorGrupoId: grupoId },
    },
  });
  if (!link) throw Errors.notFound('El producto no está vinculado a este grupo');

  await prisma.productoVentaModificadorGrupo.delete({
    where: {
      productoVentaId_modificadorGrupoId: { productoVentaId, modificadorGrupoId: grupoId },
    },
  });
}
