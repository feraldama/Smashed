
import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type { ActualizarProveedorInput, CrearProveedorInput } from './proveedor.schemas.js';
import type { Prisma } from '@prisma/client';

export async function listar(empresaId: string, q: { busqueda?: string; pageSize: number }) {
  const where: Prisma.ProveedorWhereInput = {
    empresaId,
    deletedAt: null,
    ...(q.busqueda
      ? {
          OR: [
            { razonSocial: { contains: q.busqueda, mode: 'insensitive' } },
            { ruc: { contains: q.busqueda } },
            { contacto: { contains: q.busqueda, mode: 'insensitive' } },
            { telefono: { contains: q.busqueda } },
          ],
        }
      : {}),
  };

  return prisma.proveedor.findMany({
    where,
    take: q.pageSize,
    orderBy: [{ activo: 'desc' }, { razonSocial: 'asc' }],
  });
}

export async function obtener(empresaId: string, id: string) {
  const prov = await prisma.proveedor.findFirst({
    where: { id, empresaId, deletedAt: null },
    include: {
      _count: { select: { productosInv: { where: { deletedAt: null } }, compras: true } },
    },
  });
  if (!prov) throw Errors.notFound('Proveedor no encontrado');
  return prov;
}

export async function crear(empresaId: string, input: CrearProveedorInput) {
  if (input.ruc && input.dv) {
    const dup = await prisma.proveedor.findFirst({
      where: { empresaId, ruc: input.ruc, dv: input.dv, deletedAt: null },
    });
    if (dup) throw Errors.conflict(`Ya existe un proveedor con RUC ${input.ruc}-${input.dv}`);
  }
  return prisma.proveedor.create({ data: { empresaId, ...input } });
}

export async function actualizar(empresaId: string, id: string, input: ActualizarProveedorInput) {
  const prov = await prisma.proveedor.findFirst({
    where: { id, empresaId, deletedAt: null },
  });
  if (!prov) throw Errors.notFound('Proveedor no encontrado');

  if (input.ruc && input.dv && (input.ruc !== prov.ruc || input.dv !== prov.dv)) {
    const dup = await prisma.proveedor.findFirst({
      where: { empresaId, ruc: input.ruc, dv: input.dv, deletedAt: null, id: { not: id } },
    });
    if (dup) throw Errors.conflict(`Ya existe un proveedor con RUC ${input.ruc}-${input.dv}`);
  }

  return prisma.proveedor.update({ where: { id }, data: input });
}

export async function eliminar(empresaId: string, id: string) {
  const prov = await prisma.proveedor.findFirst({
    where: { id, empresaId, deletedAt: null },
    include: {
      _count: { select: { productosInv: { where: { deletedAt: null } } } },
    },
  });
  if (!prov) throw Errors.notFound('Proveedor no encontrado');
  if (prov._count.productosInv > 0) {
    throw Errors.conflict(
      `No se puede eliminar — está asociado a ${prov._count.productosInv} insumo(s). Desvinculalos primero.`,
    );
  }

  return prisma.proveedor.update({
    where: { id },
    data: { deletedAt: new Date(), activo: false },
  });
}
