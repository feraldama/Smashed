
import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type {
  ActualizarClienteInput,
  CrearClienteInput,
  DireccionInput,
} from './cliente.schemas.js';
import type { Prisma } from '@prisma/client';

/**
 * Servicio de clientes.
 *
 * - CRUD con tenant guard por empresaId
 * - Soft delete (deletedAt)
 * - Validación de RUC/DV con módulo 11 SET (en schema Zod)
 * - Multi-direcciones por cliente con flag esPrincipal único
 */

// ───── List + detail ─────

export async function listarClientes(
  empresaId: string,
  q: { busqueda?: string; pageSize: number },
) {
  const where: Prisma.ClienteWhereInput = {
    empresaId,
    deletedAt: null,
    ...(q.busqueda
      ? {
          OR: [
            { razonSocial: { contains: q.busqueda, mode: 'insensitive' } },
            { nombreFantasia: { contains: q.busqueda, mode: 'insensitive' } },
            { ruc: { contains: q.busqueda } },
            { documento: { contains: q.busqueda } },
            { telefono: { contains: q.busqueda } },
            { email: { contains: q.busqueda, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const clientes = await prisma.cliente.findMany({
    where,
    take: q.pageSize,
    orderBy: [{ esConsumidorFinal: 'desc' }, { razonSocial: 'asc' }],
    select: {
      id: true,
      tipoContribuyente: true,
      razonSocial: true,
      nombreFantasia: true,
      ruc: true,
      dv: true,
      documento: true,
      email: true,
      telefono: true,
      esConsumidorFinal: true,
      createdAt: true,
    },
  });

  return clientes;
}

export async function obtenerCliente(empresaId: string, id: string) {
  const cliente = await prisma.cliente.findFirst({
    where: { id, empresaId, deletedAt: null },
    include: {
      direcciones: { orderBy: [{ esPrincipal: 'desc' }, { createdAt: 'asc' }] },
    },
  });
  if (!cliente) throw Errors.notFound('Cliente no encontrado');
  return cliente;
}

// ───── Crear / actualizar / eliminar ─────

export async function crearCliente(empresaId: string, input: CrearClienteInput) {
  // Verificar duplicado por RUC dentro de la empresa
  if (input.ruc && input.dv) {
    const existente = await prisma.cliente.findFirst({
      where: { empresaId, ruc: input.ruc, dv: input.dv, deletedAt: null },
    });
    if (existente) {
      throw Errors.conflict(`Ya existe un cliente con RUC ${input.ruc}-${input.dv}`);
    }
  }
  if (input.documento) {
    const existente = await prisma.cliente.findFirst({
      where: { empresaId, documento: input.documento, deletedAt: null },
    });
    if (existente) throw Errors.conflict(`Ya existe un cliente con documento ${input.documento}`);
  }

  return prisma.cliente.create({
    data: {
      empresaId,
      tipoContribuyente: input.tipoContribuyente,
      razonSocial: input.razonSocial,
      nombreFantasia: input.nombreFantasia,
      ruc: input.ruc,
      dv: input.dv,
      documento: input.documento,
      email: input.email,
      telefono: input.telefono,
      esConsumidorFinal: input.esConsumidorFinal,
    },
    include: { direcciones: true },
  });
}

export async function actualizarCliente(
  empresaId: string,
  id: string,
  input: ActualizarClienteInput,
) {
  const cliente = await prisma.cliente.findFirst({
    where: { id, empresaId, deletedAt: null },
  });
  if (!cliente) throw Errors.notFound('Cliente no encontrado');
  if (cliente.esConsumidorFinal) {
    throw Errors.conflict('No se puede modificar el cliente "consumidor final"');
  }

  // Validar duplicados si se cambia RUC o documento
  if (input.ruc && input.dv && (input.ruc !== cliente.ruc || input.dv !== cliente.dv)) {
    const dup = await prisma.cliente.findFirst({
      where: { empresaId, ruc: input.ruc, dv: input.dv, deletedAt: null, id: { not: id } },
    });
    if (dup) throw Errors.conflict(`Ya existe un cliente con RUC ${input.ruc}-${input.dv}`);
  }

  return prisma.cliente.update({
    where: { id },
    data: input,
    include: { direcciones: true },
  });
}

export async function eliminarCliente(empresaId: string, id: string) {
  const cliente = await prisma.cliente.findFirst({
    where: { id, empresaId, deletedAt: null },
  });
  if (!cliente) throw Errors.notFound('Cliente no encontrado');
  if (cliente.esConsumidorFinal) {
    throw Errors.conflict('No se puede eliminar el cliente "consumidor final"');
  }

  return prisma.cliente.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// ───── Direcciones ─────

export async function agregarDireccion(
  empresaId: string,
  clienteId: string,
  input: DireccionInput,
) {
  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, empresaId, deletedAt: null },
  });
  if (!cliente) throw Errors.notFound('Cliente no encontrado');

  return prisma.$transaction(async (tx) => {
    if (input.esPrincipal) {
      await tx.direccionCliente.updateMany({
        where: { clienteId },
        data: { esPrincipal: false },
      });
    }
    return tx.direccionCliente.create({
      data: {
        clienteId,
        alias: input.alias,
        direccion: input.direccion,
        ciudad: input.ciudad,
        departamento: input.departamento,
        referencias: input.referencias,
        latitud: input.latitud,
        longitud: input.longitud,
        esPrincipal: input.esPrincipal,
      },
    });
  });
}

export async function actualizarDireccion(
  empresaId: string,
  clienteId: string,
  dirId: string,
  input: DireccionInput,
) {
  const dir = await prisma.direccionCliente.findFirst({
    where: { id: dirId, clienteId, cliente: { empresaId, deletedAt: null } },
  });
  if (!dir) throw Errors.notFound('Dirección no encontrada');

  return prisma.$transaction(async (tx) => {
    if (input.esPrincipal) {
      await tx.direccionCliente.updateMany({
        where: { clienteId, id: { not: dirId } },
        data: { esPrincipal: false },
      });
    }
    return tx.direccionCliente.update({
      where: { id: dirId },
      data: input,
    });
  });
}

export async function eliminarDireccion(empresaId: string, clienteId: string, dirId: string) {
  const dir = await prisma.direccionCliente.findFirst({
    where: { id: dirId, clienteId, cliente: { empresaId, deletedAt: null } },
  });
  if (!dir) throw Errors.notFound('Dirección no encontrada');
  return prisma.direccionCliente.delete({ where: { id: dirId } });
}
