import { randomBytes } from 'node:crypto';

import { type Prisma, Rol, TipoContribuyente } from '@prisma/client';
import { MENU_DEFINICIONES } from '@smash/shared-types';
import { calcularDvRuc } from '@smash/shared-utils';
import bcrypt from 'bcrypt';

import { env } from '../../../config/env.js';
import { Errors } from '../../../lib/errors.js';
import { prisma } from '../../../lib/prisma.js';

import type {
  CambiarActivaInput,
  CrearEmpresaInput,
  ListarEmpresasQuery,
} from './admin-empresa.schemas.js';

interface SuperAdminCtx {
  userId: string;
  isSuperAdmin: boolean;
}

const SELECT_LISTADO = {
  id: true,
  nombreFantasia: true,
  razonSocial: true,
  ruc: true,
  dv: true,
  email: true,
  telefono: true,
  activa: true,
  motivoInactiva: true,
  fechaInactivacion: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      sucursales: { where: { deletedAt: null } },
      usuarios: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.EmpresaSelect;

function assertSuperAdmin(user: SuperAdminCtx) {
  if (!user.isSuperAdmin) throw Errors.forbidden();
}

// ───────────────────────────────────────────────────────────────────────────
//  CREAR — empresa + admin inicial + seed mínimo
// ───────────────────────────────────────────────────────────────────────────

export async function crearEmpresa(user: SuperAdminCtx, input: CrearEmpresaInput) {
  assertSuperAdmin(user);

  // Validar coherencia matemática RUC/DV (módulo 11 SET).
  if (calcularDvRuc(input.ruc) !== Number.parseInt(input.dv, 10)) {
    throw Errors.validation({ formErrors: ['El DV no coincide con el RUC'] });
  }

  // Unicidad global de RUC.
  const rucExistente = await prisma.empresa.findFirst({
    where: { ruc: input.ruc },
    select: { id: true },
  });
  if (rucExistente) throw Errors.conflict('Ya existe una empresa con ese RUC');

  // Password del admin: si no viene, generamos uno aleatorio para devolver una sola vez.
  const passwordPlano = input.admin.password ?? generarPasswordAleatoria();
  const passwordGenerada = !input.admin.password;
  const passwordHash = await bcrypt.hash(passwordPlano, env.BCRYPT_ROUNDS);

  const menuRolFilas = MENU_DEFINICIONES.flatMap((m) =>
    m.defaults.map((rol) => ({ menu: m.path, rol })),
  );

  const empresaCreada = await prisma.$transaction(async (tx) => {
    const empresa = await tx.empresa.create({
      data: {
        nombreFantasia: input.nombreFantasia,
        razonSocial: input.razonSocial,
        ruc: input.ruc,
        dv: input.dv,
        direccion: input.direccion,
        telefono: input.telefono,
        email: input.email,
        zonaHoraria: input.zonaHoraria,
        colorPrimario: input.colorPrimario,
        colorSecundario: input.colorSecundario,
        configuracion: { create: {} },
      },
      select: SELECT_LISTADO,
    });

    // Cliente "consumidor final" — uno por empresa, requerido por el flujo de venta.
    await tx.cliente.create({
      data: {
        empresaId: empresa.id,
        tipoContribuyente: TipoContribuyente.CONSUMIDOR_FINAL,
        razonSocial: 'SIN NOMBRE',
        esConsumidorFinal: true,
      },
    });

    // Usuario ADMIN_EMPRESA inicial — desde acá el cliente termina de configurar todo.
    const admin = await tx.usuario.create({
      data: {
        empresaId: empresa.id,
        email: input.admin.email,
        passwordHash,
        nombreCompleto: input.admin.nombreCompleto,
        rol: Rol.ADMIN_EMPRESA,
      },
      select: { id: true, email: true, nombreCompleto: true, rol: true },
    });

    // Permisos por defecto de menú según el catálogo central.
    if (menuRolFilas.length > 0) {
      await tx.menuRol.createMany({
        data: menuRolFilas.map((f) => ({ ...f, empresaId: empresa.id })),
        skipDuplicates: true,
      });
    }

    await tx.auditLog.create({
      data: {
        empresaId: empresa.id,
        usuarioId: user.userId,
        accion: 'CREAR',
        entidad: 'Empresa',
        entidadId: empresa.id,
        metadata: { ruc: empresa.ruc, adminEmail: admin.email },
      },
    });

    return { empresa, admin };
  });

  return {
    empresa: empresaCreada.empresa,
    admin: empresaCreada.admin,
    passwordInicial: passwordGenerada ? passwordPlano : null,
  };
}

// ───────────────────────────────────────────────────────────────────────────
//  LISTADO
// ───────────────────────────────────────────────────────────────────────────

export async function listarEmpresas(user: SuperAdminCtx, query: ListarEmpresasQuery) {
  assertSuperAdmin(user);

  const where: Prisma.EmpresaWhereInput = { deletedAt: null };
  if (query.activa !== undefined) where.activa = query.activa;
  if (query.q) {
    where.OR = [
      { razonSocial: { contains: query.q, mode: 'insensitive' } },
      { nombreFantasia: { contains: query.q, mode: 'insensitive' } },
      { ruc: { contains: query.q } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.empresa.findMany({
      where,
      select: SELECT_LISTADO,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.empresa.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

// ───────────────────────────────────────────────────────────────────────────
//  DETALLE
// ───────────────────────────────────────────────────────────────────────────

export async function obtenerEmpresaPorId(user: SuperAdminCtx, id: string) {
  assertSuperAdmin(user);

  const empresa = await prisma.empresa.findUnique({
    where: { id },
    select: SELECT_LISTADO,
  });
  if (!empresa) throw Errors.notFound('Empresa no encontrada');
  return empresa;
}

// ───────────────────────────────────────────────────────────────────────────
//  TOGGLE ACTIVA — suspender / reactivar
// ───────────────────────────────────────────────────────────────────────────

export async function cambiarActiva(user: SuperAdminCtx, id: string, input: CambiarActivaInput) {
  assertSuperAdmin(user);

  const actual = await prisma.empresa.findUnique({
    where: { id },
    select: { id: true, activa: true },
  });
  if (!actual) throw Errors.notFound('Empresa no encontrada');

  // Idempotente: si ya está en el estado pedido, no hacemos nada.
  if (actual.activa === input.activa) {
    return obtenerEmpresaPorId(user, id);
  }

  await prisma.$transaction(async (tx) => {
    await tx.empresa.update({
      where: { id },
      data: input.activa
        ? { activa: true, motivoInactiva: null, fechaInactivacion: null }
        : {
            activa: false,
            motivoInactiva: input.motivo ?? null,
            fechaInactivacion: new Date(),
          },
    });

    // Al desactivar revocamos refresh tokens vivos para cortar sesiones en
    // ≤15 min (vida del access token) sin pegarle a la BD por request.
    if (!input.activa) {
      await tx.refreshToken.updateMany({
        where: {
          revocadoEn: null,
          usuario: { empresaId: id },
        },
        data: { revocadoEn: new Date() },
      });
    }

    await tx.auditLog.create({
      data: {
        empresaId: id,
        usuarioId: user.userId,
        accion: 'ACTUALIZAR',
        entidad: 'Empresa',
        entidadId: id,
        metadata: {
          campo: 'activa',
          de: actual.activa,
          a: input.activa,
          motivo: input.activa ? null : (input.motivo ?? null),
        },
      },
    });
  });

  return obtenerEmpresaPorId(user, id);
}

// ───── helpers ─────

function generarPasswordAleatoria() {
  // 12 bytes en base64url ≈ 16 chars sin símbolos raros que rompan al pegar.
  return randomBytes(12).toString('base64url');
}
