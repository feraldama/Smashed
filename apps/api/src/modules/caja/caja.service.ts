import { EstadoCaja, MetodoPago, type Prisma, type Rol, TipoMovimientoCaja } from '@prisma/client';

import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type {
  AbrirCajaInput,
  ActualizarCajaInput,
  CerrarCajaInput,
  CrearCajaInput,
  ListarCierresQuery,
  MovimientoCajaInput,
} from './caja.schemas.js';

/**
 * Servicio de caja.
 *
 * Reglas:
 *  - Una caja abierta por usuario simultáneamente.
 *  - La caja debe pertenecer a la sucursal activa del usuario.
 *  - Cerrar: solo el cajero que abrió, o GERENTE/ADMIN.
 *  - Movimientos: solo el dueño de la apertura, o GERENTE/ADMIN.
 *  - Operaciones críticas dentro de transacción.
 */

const ROLES_GESTION_CAJA: Rol[] = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN'];

interface UserCtx {
  userId: string;
  empresaId: string | null;
  rol: Rol;
  sucursalActivaId: string | null;
  isSuperAdmin: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
//  LIST
// ───────────────────────────────────────────────────────────────────────────

export async function listarCajas(user: UserCtx, opts: { incluirInactivas?: boolean } = {}) {
  if (!user.sucursalActivaId && !user.isSuperAdmin) {
    throw Errors.forbidden('Seleccioná una sucursal activa');
  }
  const where: Prisma.CajaWhereInput =
    user.isSuperAdmin && !user.sucursalActivaId
      ? {}
      : { sucursalId: user.sucursalActivaId ?? undefined };

  const cajas = await prisma.caja.findMany({
    where: { ...where, ...(opts.incluirInactivas ? {} : { activa: true }) },
    select: {
      id: true,
      nombre: true,
      estado: true,
      activa: true,
      sucursalId: true,
      puntoExpedicionId: true,
      puntoExpedicion: { select: { id: true, codigo: true, descripcion: true } },
      sucursal: { select: { id: true, codigo: true, nombre: true } },
      // sesión abierta actual (si la hay)
      aperturas: {
        where: { cierre: null },
        take: 1,
        orderBy: { abiertaEn: 'desc' },
        select: {
          id: true,
          abiertaEn: true,
          montoInicial: true,
          usuario: { select: { id: true, nombreCompleto: true } },
        },
      },
      _count: { select: { comprobantes: true, aperturas: true } },
    },
    orderBy: { nombre: 'asc' },
  });

  return cajas.map((c) => {
    const sesion = c.aperturas[0] ?? null;
    return {
      id: c.id,
      nombre: c.nombre,
      estado: c.estado,
      activa: c.activa,
      sucursalId: c.sucursalId,
      sucursal: c.sucursal,
      puntoExpedicionId: c.puntoExpedicionId,
      puntoExpedicion: c.puntoExpedicion
        ? {
            id: c.puntoExpedicion.id,
            codigo: c.puntoExpedicion.codigo,
            descripcion: c.puntoExpedicion.descripcion,
          }
        : null,
      sesionActiva: sesion
        ? {
            aperturaId: sesion.id,
            abiertaEn: sesion.abiertaEn,
            montoInicial: sesion.montoInicial,
            usuario: sesion.usuario,
          }
        : null,
      _count: c._count,
    };
  });
}

// ═════════════════════════════════════════════════════════════════════════
//  CRUD ADMIN
// ═════════════════════════════════════════════════════════════════════════

async function assertSucursalEnEmpresa(user: UserCtx, sucursalId: string) {
  if (!user.empresaId) throw Errors.unauthorized();
  const suc = await prisma.sucursal.findUnique({
    where: { id: sucursalId },
    select: { empresaId: true },
  });
  if (!suc) throw Errors.notFound('Sucursal no encontrada');
  if (!user.isSuperAdmin && suc.empresaId !== user.empresaId) throw Errors.tenantMismatch();
}

async function getCajaOwned(user: UserCtx, id: string) {
  if (!user.empresaId) throw Errors.unauthorized();
  const caja = await prisma.caja.findUnique({
    where: { id },
    include: { sucursal: { select: { empresaId: true } } },
  });
  if (!caja) throw Errors.notFound('Caja no encontrada');
  if (!user.isSuperAdmin && caja.sucursal.empresaId !== user.empresaId) {
    throw Errors.tenantMismatch();
  }
  return caja;
}

async function assertPuntoExpedicionEnSucursal(puntoExpedicionId: string, sucursalId: string) {
  const pe = await prisma.puntoExpedicion.findUnique({
    where: { id: puntoExpedicionId },
    select: { sucursalId: true },
  });
  if (!pe) throw Errors.notFound('Punto de expedición no encontrado');
  if (pe.sucursalId !== sucursalId) {
    throw Errors.conflict('El punto de expedición no pertenece a esa sucursal');
  }
}

export async function crearCaja(user: UserCtx, input: CrearCajaInput) {
  await assertSucursalEnEmpresa(user, input.sucursalId);

  const dup = await prisma.caja.findUnique({
    where: { sucursalId_nombre: { sucursalId: input.sucursalId, nombre: input.nombre } },
  });
  if (dup) throw Errors.conflict(`Ya existe una caja "${input.nombre}" en esa sucursal`);

  if (input.puntoExpedicionId) {
    await assertPuntoExpedicionEnSucursal(input.puntoExpedicionId, input.sucursalId);
  }

  return prisma.caja.create({
    data: {
      sucursalId: input.sucursalId,
      nombre: input.nombre,
      puntoExpedicionId: input.puntoExpedicionId ?? null,
    },
  });
}

export async function actualizarCaja(user: UserCtx, id: string, input: ActualizarCajaInput) {
  const caja = await getCajaOwned(user, id);

  if (input.nombre && input.nombre !== caja.nombre) {
    const dup = await prisma.caja.findUnique({
      where: { sucursalId_nombre: { sucursalId: caja.sucursalId, nombre: input.nombre } },
    });
    if (dup && dup.id !== id) {
      throw Errors.conflict(`Ya existe una caja "${input.nombre}" en esa sucursal`);
    }
  }

  if (input.puntoExpedicionId) {
    await assertPuntoExpedicionEnSucursal(input.puntoExpedicionId, caja.sucursalId);
  }

  return prisma.caja.update({ where: { id }, data: input });
}

export async function eliminarCaja(user: UserCtx, id: string) {
  const caja = await getCajaOwned(user, id);

  if (caja.estado === EstadoCaja.ABIERTA) {
    throw Errors.conflict(
      'No se puede eliminar una caja abierta — cerrala primero desde la pantalla de Caja.',
    );
  }

  const sesionAbierta = await prisma.aperturaCaja.findFirst({
    where: { cajaId: id, cierre: null },
    select: { id: true },
  });
  if (sesionAbierta) {
    throw Errors.conflict('Hay una sesión de caja abierta — cerrala antes de eliminar la caja.');
  }

  // Soft delete (mantiene comprobantes asociados intactos)
  return prisma.caja.update({
    where: { id },
    data: { activa: false },
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  GET ACTIVA — la sesión del usuario actual
// ───────────────────────────────────────────────────────────────────────────

export async function obtenerAperturaActivaDelUser(user: UserCtx) {
  const apertura = await prisma.aperturaCaja.findFirst({
    where: { usuarioId: user.userId, cierre: null },
    include: {
      caja: {
        select: {
          id: true,
          nombre: true,
          sucursalId: true,
          puntoExpedicion: { select: { codigo: true } },
        },
      },
    },
  });
  if (!apertura) return null;
  return apertura;
}

// ───────────────────────────────────────────────────────────────────────────
//  ABRIR
// ───────────────────────────────────────────────────────────────────────────

export async function abrirCaja(
  user: UserCtx,
  cajaId: string,
  input: AbrirCajaInput,
  meta: { ip?: string },
) {
  if (!user.sucursalActivaId && !user.isSuperAdmin) {
    throw Errors.forbidden('Seleccioná una sucursal activa antes de abrir caja');
  }

  return prisma.$transaction(async (tx) => {
    const caja = await tx.caja.findUnique({
      where: { id: cajaId },
      select: {
        id: true,
        sucursalId: true,
        estado: true,
        activa: true,
        sucursal: { select: { empresaId: true } },
      },
    });
    if (!caja || !caja.activa) throw Errors.notFound('Caja no encontrada');

    // Tenant guard
    if (!user.isSuperAdmin) {
      if (caja.sucursal.empresaId !== user.empresaId) throw Errors.tenantMismatch();
      if (caja.sucursalId !== user.sucursalActivaId) throw Errors.sucursalNoAutorizada();
    }

    // No puede estar ya abierta
    if (caja.estado === EstadoCaja.ABIERTA) {
      throw Errors.conflict('La caja ya está abierta');
    }

    // El user no puede tener otra caja abierta
    const otra = await tx.aperturaCaja.findFirst({
      where: { usuarioId: user.userId, cierre: null },
      select: { id: true, cajaId: true },
    });
    if (otra) {
      throw Errors.conflict(`Ya tenés una caja abierta (${otra.cajaId})`);
    }

    // Crear apertura + movimiento + actualizar estado de caja
    const apertura = await tx.aperturaCaja.create({
      data: {
        cajaId,
        usuarioId: user.userId,
        montoInicial: input.montoInicial,
        notas: input.notas,
      },
    });

    await tx.caja.update({
      where: { id: cajaId },
      data: { estado: EstadoCaja.ABIERTA },
    });

    await tx.movimientoCaja.create({
      data: {
        cajaId,
        aperturaCajaId: apertura.id,
        tipo: TipoMovimientoCaja.APERTURA,
        metodoPago: MetodoPago.EFECTIVO,
        monto: input.montoInicial,
        concepto: 'Apertura de caja',
      },
    });

    await tx.auditLog.create({
      data: {
        empresaId: user.empresaId,
        sucursalId: caja.sucursalId,
        usuarioId: user.userId,
        accion: 'APERTURA_CAJA',
        entidad: 'Caja',
        entidadId: cajaId,
        ip: meta.ip,
        metadata: { aperturaId: apertura.id, montoInicial: input.montoInicial.toString() },
      },
    });

    return apertura;
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  MOVIMIENTO (INGRESO_EXTRA, EGRESO, RETIRO_PARCIAL)
// ───────────────────────────────────────────────────────────────────────────

export async function registrarMovimiento(
  user: UserCtx,
  aperturaId: string,
  input: MovimientoCajaInput,
) {
  const apertura = await prisma.aperturaCaja.findUnique({
    where: { id: aperturaId },
    include: {
      cierre: true,
      caja: { select: { sucursalId: true, sucursal: { select: { empresaId: true } } } },
    },
  });
  if (!apertura) throw Errors.notFound('Apertura no encontrada');
  if (apertura.cierre) throw Errors.conflict('La caja ya está cerrada');

  // Tenant guard
  if (!user.isSuperAdmin && apertura.caja.sucursal.empresaId !== user.empresaId) {
    throw Errors.tenantMismatch();
  }
  // Solo dueño o roles de gestión
  const esDueno = apertura.usuarioId === user.userId;
  if (!esDueno && !ROLES_GESTION_CAJA.includes(user.rol)) {
    throw Errors.forbidden('Solo el cajero o un gerente pueden registrar movimientos en esta caja');
  }

  return prisma.movimientoCaja.create({
    data: {
      cajaId: apertura.cajaId,
      aperturaCajaId: apertura.id,
      tipo: input.tipo,
      metodoPago: MetodoPago.EFECTIVO,
      monto: input.monto,
      concepto: input.concepto,
    },
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  CERRAR — calcula totales esperados + diferencia
// ───────────────────────────────────────────────────────────────────────────

export async function cerrarCaja(
  user: UserCtx,
  aperturaId: string,
  input: CerrarCajaInput,
  meta: { ip?: string },
) {
  return prisma.$transaction(async (tx) => {
    const apertura = await tx.aperturaCaja.findUnique({
      where: { id: aperturaId },
      include: {
        cierre: true,
        caja: { select: { id: true, sucursalId: true, sucursal: { select: { empresaId: true } } } },
        movimientos: { select: { tipo: true, metodoPago: true, monto: true } },
      },
    });
    if (!apertura) throw Errors.notFound('Apertura no encontrada');
    if (apertura.cierre) throw Errors.conflict('La caja ya está cerrada');

    if (!user.isSuperAdmin && apertura.caja.sucursal.empresaId !== user.empresaId) {
      throw Errors.tenantMismatch();
    }
    const esDueno = apertura.usuarioId === user.userId;
    if (!esDueno && !ROLES_GESTION_CAJA.includes(user.rol)) {
      throw Errors.forbidden('Solo el cajero o un gerente pueden cerrar esta caja');
    }

    // Calcular totales esperados
    const totales = calcularTotales(apertura.movimientos);
    const diferenciaEfectivo = input.totalContadoEfectivo - totales.totalEsperadoEfectivo;

    const cierre = await tx.cierreCaja.create({
      data: {
        cajaId: apertura.cajaId,
        aperturaCajaId: apertura.id,
        usuarioId: user.userId,
        totalEsperadoEfectivo: totales.totalEsperadoEfectivo,
        totalContadoEfectivo: input.totalContadoEfectivo,
        diferenciaEfectivo,
        totalVentas: totales.totalVentas,
        totalesPorMetodo: totales.totalesPorMetodo,
        conteoEfectivo: input.conteoEfectivo ?? undefined,
        notas: input.notas,
      },
    });

    await tx.caja.update({
      where: { id: apertura.cajaId },
      data: { estado: EstadoCaja.CERRADA },
    });

    await tx.movimientoCaja.create({
      data: {
        cajaId: apertura.cajaId,
        aperturaCajaId: apertura.id,
        tipo: TipoMovimientoCaja.CIERRE,
        metodoPago: MetodoPago.EFECTIVO,
        monto: input.totalContadoEfectivo,
        concepto: 'Cierre de caja',
      },
    });

    await tx.auditLog.create({
      data: {
        empresaId: user.empresaId,
        sucursalId: apertura.caja.sucursalId,
        usuarioId: user.userId,
        accion: 'CIERRE_CAJA',
        entidad: 'CierreCaja',
        entidadId: cierre.id,
        ip: meta.ip,
        metadata: {
          aperturaId: apertura.id,
          totalEsperado: totales.totalEsperadoEfectivo.toString(),
          totalContado: input.totalContadoEfectivo.toString(),
          diferencia: diferenciaEfectivo.toString(),
        },
      },
    });

    return cierre;
  });
}

// ───────────────────────────────────────────────────────────────────────────
//  GET DETALLE de apertura
// ───────────────────────────────────────────────────────────────────────────

export async function obtenerApertura(user: UserCtx, aperturaId: string) {
  const apertura = await prisma.aperturaCaja.findUnique({
    where: { id: aperturaId },
    include: {
      caja: {
        select: {
          id: true,
          nombre: true,
          sucursalId: true,
          sucursal: { select: { empresaId: true } },
        },
      },
      usuario: { select: { id: true, nombreCompleto: true } },
      cierre: true,
      movimientos: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          tipo: true,
          metodoPago: true,
          monto: true,
          concepto: true,
          createdAt: true,
          comprobanteId: true,
        },
      },
    },
  });
  if (!apertura) throw Errors.notFound('Apertura no encontrada');
  if (!user.isSuperAdmin && apertura.caja.sucursal.empresaId !== user.empresaId) {
    throw Errors.tenantMismatch();
  }

  const totales = calcularTotales(apertura.movimientos);

  return {
    ...apertura,
    totales,
  };
}

// ───────────────────────────────────────────────────────────────────────────
//  LISTADO DE CIERRES — histórico para auditoría (admin/gerente).
//  Filtros: rango de fecha, caja, cajero. Paginación clásica.
//  Tenant: filtra por empresa del usuario; si tiene sucursal activa, también
//  por esa sucursal (el admin puede no tenerla y ver todas).
// ───────────────────────────────────────────────────────────────────────────

export async function listarCierres(user: UserCtx, q: ListarCierresQuery) {
  if (!user.empresaId) {
    if (!user.isSuperAdmin) throw Errors.forbidden('Usuario sin empresa');
    return { cierres: [], total: 0, page: q.page, pageSize: q.pageSize };
  }

  const where: Prisma.CierreCajaWhereInput = {
    caja: {
      sucursal: { empresaId: user.empresaId },
      ...(user.sucursalActivaId ? { sucursalId: user.sucursalActivaId } : {}),
    },
    ...(q.cajaId ? { cajaId: q.cajaId } : {}),
    ...(q.usuarioId ? { usuarioId: q.usuarioId } : {}),
    ...(q.desde || q.hasta
      ? {
          cerradaEn: {
            ...(q.desde ? { gte: q.desde } : {}),
            ...(q.hasta ? { lte: q.hasta } : {}),
          },
        }
      : {}),
  };

  const [cierres, total] = await Promise.all([
    prisma.cierreCaja.findMany({
      where,
      take: q.pageSize,
      skip: (q.page - 1) * q.pageSize,
      orderBy: { cerradaEn: 'desc' },
      select: {
        id: true,
        cerradaEn: true,
        totalEsperadoEfectivo: true,
        totalContadoEfectivo: true,
        diferenciaEfectivo: true,
        totalVentas: true,
        caja: { select: { id: true, nombre: true } },
        usuario: { select: { id: true, nombreCompleto: true } },
        apertura: { select: { abiertaEn: true, montoInicial: true } },
      },
    }),
    prisma.cierreCaja.count({ where }),
  ]);

  return { cierres, total, page: q.page, pageSize: q.pageSize };
}

// ───────────────────────────────────────────────────────────────────────────
//  GET DETALLE DE CIERRE — para impresión de ticket Z post-cierre.
//  Incluye datos del cajero, caja, sucursal, empresa, apertura asociada,
//  totales por método, diferencia, conteo por denominación.
// ───────────────────────────────────────────────────────────────────────────

export async function obtenerCierre(user: UserCtx, cierreId: string) {
  const cierre = await prisma.cierreCaja.findUnique({
    where: { id: cierreId },
    include: {
      caja: {
        select: {
          id: true,
          nombre: true,
          sucursalId: true,
          sucursal: {
            select: {
              id: true,
              nombre: true,
              direccion: true,
              empresaId: true,
              empresa: { select: { id: true, razonSocial: true, ruc: true, dv: true } },
            },
          },
        },
      },
      usuario: { select: { id: true, nombreCompleto: true, email: true } },
      apertura: {
        select: {
          id: true,
          montoInicial: true,
          abiertaEn: true,
        },
      },
    },
  });
  if (!cierre) throw Errors.notFound('Cierre no encontrado');
  if (!user.isSuperAdmin && cierre.caja.sucursal.empresaId !== user.empresaId) {
    throw Errors.tenantMismatch();
  }
  return cierre;
}

// ───────────────────────────────────────────────────────────────────────────
//  Helpers
// ───────────────────────────────────────────────────────────────────────────

interface MovSlim {
  tipo: TipoMovimientoCaja;
  metodoPago: MetodoPago | null;
  monto: bigint;
}

function calcularTotales(movimientos: MovSlim[]) {
  // Totales por método (sólo de tipo VENTA)
  const totalesPorMetodo: Record<string, string> = {};
  let totalVentas = 0n;
  let totalEsperadoEfectivo = 0n;

  for (const m of movimientos) {
    const metodo = m.metodoPago ?? 'EFECTIVO';

    if (m.tipo === TipoMovimientoCaja.VENTA) {
      totalVentas += m.monto;
      const prev = BigInt(totalesPorMetodo[metodo] ?? '0');
      totalesPorMetodo[metodo] = (prev + m.monto).toString();
      if (metodo === MetodoPago.EFECTIVO) totalEsperadoEfectivo += m.monto;
    }

    if (metodo === MetodoPago.EFECTIVO) {
      switch (m.tipo) {
        case TipoMovimientoCaja.APERTURA:
        case TipoMovimientoCaja.INGRESO_EXTRA:
          totalEsperadoEfectivo += m.monto;
          break;
        case TipoMovimientoCaja.EGRESO:
        case TipoMovimientoCaja.RETIRO_PARCIAL:
          totalEsperadoEfectivo -= m.monto;
          break;
      }
    }
  }

  return {
    totalVentas,
    totalEsperadoEfectivo,
    totalesPorMetodo,
  };
}
