/**
 * Servicio de promociones.
 *
 * CRUD admin + endpoint de lectura para el POS (`/vigentes`) que filtra por
 * día de la semana / horario / vigencia en la zona horaria de la sucursal.
 *
 * Reglas duras:
 *  - Una promoción sin filas en `PromocionSucursal` aplica a TODAS las
 *    sucursales de la empresa (convención simple).
 *  - Las promos son excluyentes con descuentos manuales — eso lo enforcea el
 *    módulo descuento (no acá).
 *  - Soft delete: hay items históricos (ItemPedido.promocionId) que pueden
 *    referenciar la promo aún cuando ya no se ofrece.
 */
import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { ahoraEnTz } from '../../lib/tz.js';

import type {
  ActualizarPromocionInput,
  CrearPromocionInput,
  ListarPromocionesQuery,
  VigentesQuery,
} from './promocion.schemas.js';
import type { Prisma, Rol } from '@prisma/client';

interface UserCtx {
  userId: string;
  empresaId: string | null;
  rol: Rol;
  isSuperAdmin: boolean;
}

const ROLES_GESTION: Rol[] = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN'];

function requireEmpresa(user: UserCtx): string {
  if (!user.empresaId) throw Errors.forbidden('Usuario sin empresa');
  return user.empresaId;
}

function assertGestion(user: UserCtx) {
  if (!ROLES_GESTION.includes(user.rol)) throw Errors.forbidden();
}

const PROMOCION_INCLUDE = {
  productos: {
    include: {
      productoVenta: {
        select: { id: true, nombre: true, codigo: true, precioBase: true, imagenUrl: true },
      },
    },
  },
  sucursales: { select: { sucursalId: true } },
} satisfies Prisma.PromocionInclude;

// ═════════════════════════════════════════════════════════════════════════
//  Validación del payload contra el estado actual (productos/sucursales reales)
// ═════════════════════════════════════════════════════════════════════════

async function validarReferencias(
  empresaId: string,
  productos: Array<{ productoVentaId: string }>,
  sucursalIds: string[],
) {
  if (productos.length > 0) {
    const ids = productos.map((p) => p.productoVentaId);
    const count = await prisma.productoVenta.count({
      where: { id: { in: ids }, empresaId, deletedAt: null },
    });
    if (count !== ids.length) {
      throw Errors.validation({ productos: 'Algún producto no existe o pertenece a otra empresa' });
    }
  }
  if (sucursalIds.length > 0) {
    const count = await prisma.sucursal.count({
      where: { id: { in: sucursalIds }, empresaId, deletedAt: null },
    });
    if (count !== sucursalIds.length) {
      throw Errors.validation({ sucursalIds: 'Alguna sucursal no existe o es de otra empresa' });
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════
//  CRUD
// ═════════════════════════════════════════════════════════════════════════

export async function listar(user: UserCtx, q: ListarPromocionesQuery) {
  const empresaId = requireEmpresa(user);
  const where: Prisma.PromocionWhereInput = {
    empresaId,
    deletedAt: null,
  };
  if (q.filtro === 'ACTIVAS') where.activo = true;
  if (q.filtro === 'INACTIVAS') where.activo = false;
  if (q.q) where.nombre = { contains: q.q, mode: 'insensitive' };

  return prisma.promocion.findMany({
    where,
    orderBy: [{ ordenMenu: 'asc' }, { nombre: 'asc' }],
    include: PROMOCION_INCLUDE,
  });
}

export async function obtener(user: UserCtx, id: string) {
  const empresaId = requireEmpresa(user);
  const promo = await prisma.promocion.findFirst({
    where: { id, empresaId, deletedAt: null },
    include: PROMOCION_INCLUDE,
  });
  if (!promo) throw Errors.notFound('Promoción no encontrada');
  return promo;
}

export async function crear(user: UserCtx, input: CrearPromocionInput) {
  assertGestion(user);
  const empresaId = requireEmpresa(user);

  const dup = await prisma.promocion.findFirst({
    where: { empresaId, nombre: input.nombre, deletedAt: null },
  });
  if (dup) throw Errors.conflict(`Ya existe una promoción "${input.nombre}"`);

  await validarReferencias(empresaId, input.productos, input.sucursalIds);

  // Campos escalares comunes al create y al revive de una promo borrada.
  const scalars = {
    descripcion: input.descripcion ?? null,
    tipo: input.tipo,
    precioFijo: input.precioFijo == null ? null : BigInt(input.precioFijo),
    porcentaje: input.porcentaje ?? null,
    nxmLleva: input.nxmLleva ?? null,
    nxmPaga: input.nxmPaga ?? null,
    vigenciaDesde: input.vigenciaDesde ? new Date(input.vigenciaDesde) : null,
    vigenciaHasta: input.vigenciaHasta ? new Date(input.vigenciaHasta) : null,
    diasSemana: input.diasSemana ?? [],
    horaInicio: input.horaInicio ?? null,
    horaFin: input.horaFin ?? null,
    activo: input.activo,
    iconoEmoji: input.iconoEmoji ?? null,
    ordenMenu: input.ordenMenu,
  };

  // El constraint @@unique([empresaId, nombre]) no contempla deletedAt: una
  // promo borrada (soft delete) sigue ocupando el nombre y haría fallar el
  // create con P2002. El chequeo de `dup` de arriba solo mira las activas, así
  // que si hay una borrada con ese nombre la revivimos en vez de insertar:
  // restauramos la fila y reemplazamos productos/sucursales en bloque (igual
  // que en `actualizar`).
  const borrada = await prisma.promocion.findFirst({
    where: { empresaId, nombre: input.nombre, deletedAt: { not: null } },
  });
  if (borrada) {
    return prisma.$transaction(async (tx) => {
      await tx.promocionProducto.deleteMany({ where: { promocionId: borrada.id } });
      await tx.promocionProducto.createMany({
        data: input.productos.map((p) => ({
          promocionId: borrada.id,
          productoVentaId: p.productoVentaId,
          cantidadMin: p.cantidadMin,
        })),
      });
      await tx.promocionSucursal.deleteMany({ where: { promocionId: borrada.id } });
      if (input.sucursalIds.length > 0) {
        await tx.promocionSucursal.createMany({
          data: input.sucursalIds.map((sucursalId) => ({ promocionId: borrada.id, sucursalId })),
        });
      }
      return tx.promocion.update({
        where: { id: borrada.id },
        data: { ...scalars, deletedAt: null },
        include: PROMOCION_INCLUDE,
      });
    });
  }

  return prisma.promocion.create({
    data: {
      empresaId,
      nombre: input.nombre,
      ...scalars,
      productos: {
        create: input.productos.map((p) => ({
          productoVentaId: p.productoVentaId,
          cantidadMin: p.cantidadMin,
        })),
      },
      sucursales:
        input.sucursalIds.length > 0
          ? { create: input.sucursalIds.map((sucursalId) => ({ sucursalId })) }
          : undefined,
    },
    include: PROMOCION_INCLUDE,
  });
}

export async function actualizar(user: UserCtx, id: string, input: ActualizarPromocionInput) {
  assertGestion(user);
  const empresaId = requireEmpresa(user);

  const existente = await prisma.promocion.findFirst({
    where: { id, empresaId, deletedAt: null },
    include: { productos: true, sucursales: true },
  });
  if (!existente) throw Errors.notFound('Promoción no encontrada');

  if (input.nombre && input.nombre !== existente.nombre) {
    const dup = await prisma.promocion.findFirst({
      where: { empresaId, nombre: input.nombre, deletedAt: null, id: { not: id } },
    });
    if (dup) throw Errors.conflict(`Ya existe una promoción "${input.nombre}"`);
  }

  if (input.productos) {
    await validarReferencias(empresaId, input.productos, input.sucursalIds ?? []);
  } else if (input.sucursalIds) {
    await validarReferencias(empresaId, [], input.sucursalIds);
  }

  const data: Prisma.PromocionUpdateInput = {};
  if (input.nombre !== undefined) data.nombre = input.nombre;
  if (input.descripcion !== undefined) data.descripcion = input.descripcion ?? null;
  if (input.tipo !== undefined) data.tipo = input.tipo;
  if (input.precioFijo !== undefined)
    data.precioFijo = input.precioFijo == null ? null : BigInt(input.precioFijo);
  if (input.porcentaje !== undefined) data.porcentaje = input.porcentaje ?? null;
  if (input.nxmLleva !== undefined) data.nxmLleva = input.nxmLleva ?? null;
  if (input.nxmPaga !== undefined) data.nxmPaga = input.nxmPaga ?? null;
  if (input.vigenciaDesde !== undefined)
    data.vigenciaDesde = input.vigenciaDesde ? new Date(input.vigenciaDesde) : null;
  if (input.vigenciaHasta !== undefined)
    data.vigenciaHasta = input.vigenciaHasta ? new Date(input.vigenciaHasta) : null;
  if (input.diasSemana !== undefined) data.diasSemana = input.diasSemana;
  if (input.horaInicio !== undefined) data.horaInicio = input.horaInicio ?? null;
  if (input.horaFin !== undefined) data.horaFin = input.horaFin ?? null;
  if (input.activo !== undefined) data.activo = input.activo;
  if (input.iconoEmoji !== undefined) data.iconoEmoji = input.iconoEmoji ?? null;
  if (input.ordenMenu !== undefined) data.ordenMenu = input.ordenMenu;

  // Productos y sucursales se reemplazan en bloque: delete all + create.
  // Es simple y atómico dentro de la transacción; el volumen es bajo.
  return prisma.$transaction(async (tx) => {
    if (input.productos) {
      await tx.promocionProducto.deleteMany({ where: { promocionId: id } });
      await tx.promocionProducto.createMany({
        data: input.productos.map((p) => ({
          promocionId: id,
          productoVentaId: p.productoVentaId,
          cantidadMin: p.cantidadMin,
        })),
      });
    }
    if (input.sucursalIds) {
      await tx.promocionSucursal.deleteMany({ where: { promocionId: id } });
      if (input.sucursalIds.length > 0) {
        await tx.promocionSucursal.createMany({
          data: input.sucursalIds.map((sucursalId) => ({ promocionId: id, sucursalId })),
        });
      }
    }
    return tx.promocion.update({ where: { id }, data, include: PROMOCION_INCLUDE });
  });
}

export async function eliminar(user: UserCtx, id: string) {
  assertGestion(user);
  const empresaId = requireEmpresa(user);
  const promo = await prisma.promocion.findFirst({
    where: { id, empresaId, deletedAt: null },
  });
  if (!promo) throw Errors.notFound('Promoción no encontrada');
  // Soft delete: ItemPedido históricos pueden referenciarla.
  await prisma.promocion.update({
    where: { id },
    data: { deletedAt: new Date(), activo: false },
  });
}

// ═════════════════════════════════════════════════════════════════════════
//  /vigentes — lo consume el POS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Verifica si una promo está vigente en un instante dado dentro de una sucursal.
 * Devuelve la promo con sus productos si está vigente, o `null` si no.
 * Útil para validar al cargar items del pedido cuando vienen con promocionId.
 */
export async function obtenerPromocionVigente(args: {
  promocionId: string;
  empresaId: string;
  sucursalId: string;
  now?: Date;
}) {
  const sucursal = await prisma.sucursal.findFirst({
    where: { id: args.sucursalId, empresaId: args.empresaId, deletedAt: null },
    select: { id: true, zonaHoraria: true, empresa: { select: { zonaHoraria: true } } },
  });
  if (!sucursal) return null;

  const promo = await prisma.promocion.findFirst({
    where: {
      id: args.promocionId,
      empresaId: args.empresaId,
      activo: true,
      deletedAt: null,
    },
    include: {
      productos: { select: { productoVentaId: true, cantidadMin: true } },
      sucursales: { select: { sucursalId: true } },
    },
  });
  if (!promo) return null;

  const now = args.now ?? new Date();
  if (promo.vigenciaDesde && now < promo.vigenciaDesde) return null;
  if (promo.vigenciaHasta && now > promo.vigenciaHasta) return null;

  if (
    promo.sucursales.length > 0 &&
    !promo.sucursales.some((s) => s.sucursalId === args.sucursalId)
  ) {
    return null;
  }

  const tz = sucursal.zonaHoraria ?? sucursal.empresa.zonaHoraria;
  const { diaSemana, horaHHmm } = ahoraEnTz(now, tz);
  if (promo.diasSemana.length > 0 && !promo.diasSemana.includes(diaSemana)) return null;
  if (promo.horaInicio && horaHHmm < promo.horaInicio) return null;
  if (promo.horaFin && horaHHmm >= promo.horaFin) return null;

  return promo;
}

export async function listarVigentes(user: UserCtx, q: VigentesQuery) {
  const empresaId = requireEmpresa(user);

  const sucursal = await prisma.sucursal.findFirst({
    where: { id: q.sucursalId, empresaId, deletedAt: null },
    select: { id: true, zonaHoraria: true, empresa: { select: { zonaHoraria: true } } },
  });
  if (!sucursal) throw Errors.notFound('Sucursal no encontrada');

  const tz = sucursal.zonaHoraria ?? sucursal.empresa.zonaHoraria;
  const now = q.now ? new Date(q.now) : new Date();
  const { diaSemana, horaHHmm } = ahoraEnTz(now, tz);

  // 1) Filtro grueso en SQL: empresa, activas, no eliminadas, vigencia absoluta.
  const candidatas = await prisma.promocion.findMany({
    where: {
      empresaId,
      activo: true,
      deletedAt: null,
      AND: [
        {
          OR: [{ vigenciaDesde: null }, { vigenciaDesde: { lte: now } }],
        },
        {
          OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: now } }],
        },
        // Sucursales: la promo aplica si no tiene filas (todas) o si incluye esta sucursal.
        {
          OR: [
            { sucursales: { none: {} } },
            { sucursales: { some: { sucursalId: q.sucursalId } } },
          ],
        },
      ],
    },
    include: PROMOCION_INCLUDE,
    orderBy: [{ ordenMenu: 'asc' }, { nombre: 'asc' }],
  });

  // 2) Filtro fino en JS por día de semana y hora local.
  return candidatas.filter((p) => {
    if (p.diasSemana.length > 0 && !p.diasSemana.includes(diaSemana)) return false;
    if (p.horaInicio && horaHHmm < p.horaInicio) return false;
    if (p.horaFin && horaHHmm >= p.horaFin) return false;
    return true;
  });
}
