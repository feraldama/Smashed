import { EstadoPedido } from '@prisma/client';
import bcrypt from 'bcrypt';

import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type {
  ActualizarLimitesInput,
  ActualizarMotivoInput,
  AplicarDescuentoInput,
  CrearCodigoInput,
  CrearMotivoInput,
  ListarCodigosQuery,
  VerificarSupervisorInput,
} from './descuento.schemas.js';
import type { Rol, TipoDescuento } from '@prisma/client';

/**
 * Servicio de descuentos.
 *
 * Responsabilidades:
 *  - Aplicar y remover descuentos a un pedido con validación de autorización
 *    en cascada: rol del cajero → supervisor en vivo → código de un solo uso.
 *  - CRUD de motivos (catálogo de razones por empresa).
 *  - CRUD de límites por rol (max %, puede autorizar, puede cortesía).
 *  - CRUD de códigos de autorización de un solo uso.
 *
 * Reglas duras:
 *  - El descuento se aplica al total bruto del pedido (subtotal + IVA), NO al
 *    recargo delivery. El subtotal/IVA del pedido NO se modifican — el
 *    descuento es una línea aparte (totalDescuento). El comprobante prorratea
 *    el descuento entre los ítems en SIFEN (Fase 4).
 *  - Defaults seguros: nadie puede dar descuentos hasta que admin configure
 *    LimiteDescuentoRol. Si no hay fila para el rol, maxPorcentaje=0.
 *  - Un solo descuento por pedido — reaplicar SOBRESCRIBE.
 *  - No se puede modificar el descuento de un pedido FACTURADO o CANCELADO.
 */

interface UserCtx {
  userId: string;
  empresaId: string | null;
  rol: Rol;
  isSuperAdmin: boolean;
}

const ESTADOS_INMUTABLES: EstadoPedido[] = [EstadoPedido.FACTURADO, EstadoPedido.CANCELADO];
const ROLES_GESTION: Rol[] = ['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN'];

function requireEmpresa(user: UserCtx): string {
  if (!user.empresaId) throw Errors.forbidden('Usuario sin empresa');
  return user.empresaId;
}

// ═════════════════════════════════════════════════════════════════════════
//  Cálculo: dado un input + base del pedido, devolver monto + % efectivo
// ═════════════════════════════════════════════════════════════════════════

/**
 * Devuelve `{ monto, porcentajeEfectivo }` para un input dado sobre la base.
 * El % efectivo se usa para comparar con los límites del rol/supervisor/código.
 *
 *  - base = subtotal + totalIva del pedido (lo que paga el cliente sin descuento)
 *  - PORCENTAJE: monto = base * valor / 10000 ; porcentaje = valor / 100 (1500 → 15%)
 *  - MONTO: monto = valor (cap a la base) ; porcentaje = ceil(monto / base * 100)
 *  - CORTESIA: monto = base ; porcentaje = 100
 *
 * Importante: el monto se cappea a la base para evitar descuentos negativos.
 */
function calcularDescuento(
  tipo: TipoDescuento,
  valor: bigint,
  base: bigint,
): { monto: bigint; porcentajeEfectivo: number } {
  if (base <= 0n) return { monto: 0n, porcentajeEfectivo: 0 };

  if (tipo === 'CORTESIA') {
    return { monto: base, porcentajeEfectivo: 100 };
  }
  if (tipo === 'PORCENTAJE') {
    const monto = (base * valor) / 10000n;
    const cappedMonto = monto > base ? base : monto;
    return { monto: cappedMonto, porcentajeEfectivo: Math.min(100, Number(valor) / 100) };
  }
  // MONTO
  const cappedMonto = valor > base ? base : valor;
  const pctNumber = Number(cappedMonto) / Number(base);
  return { monto: cappedMonto, porcentajeEfectivo: Math.ceil(pctNumber * 100) };
}

// ═════════════════════════════════════════════════════════════════════════
//  Validación de autorización (rol propio / supervisor / código)
// ═════════════════════════════════════════════════════════════════════════

interface AutorizacionResultado {
  autorizadoPorId: string | null;
  codigoAutorizacionId: string | null;
}

/**
 * Valida que el usuario actual tenga permiso para aplicar este descuento.
 *
 * Camino feliz: el rol del cajero tiene maxPorcentaje >= porcentajeEfectivo
 * → autorizadoPorId=null (no escaló).
 *
 * Si no alcanza:
 *  - Si vino supervisorAuth → verifica credenciales + maxPorcentaje del supervisor
 *  - Si vino codigoAutorizacion → busca código, valida activo/vigente, marca usado
 *  - Si no vino ninguna → 403
 *
 * Además: si el motivo tiene requiereAutorizacion=true, SIEMPRE exige
 * autorización aunque el % esté dentro del tope del rol (motivos sensibles).
 *
 * Para CORTESIA: el rol o el supervisor deben tener puedeUsarCortesia=true.
 */
async function validarAutorizacion(args: {
  empresaId: string;
  user: UserCtx;
  tipo: TipoDescuento;
  porcentajeEfectivo: number;
  motivoRequiereAutorizacion: boolean;
  supervisorAuth?: { email: string; password: string };
  codigoAutorizacion?: string;
}): Promise<AutorizacionResultado> {
  const limiteRol = await prisma.limiteDescuentoRol.findUnique({
    where: { empresaId_rol: { empresaId: args.empresaId, rol: args.user.rol } },
  });
  const maxRol = limiteRol?.maxPorcentaje ?? 0;
  const cortesiaRol = limiteRol?.puedeUsarCortesia ?? false;

  // Camino rápido: el rol cubre el % Y el motivo no exige escalado Y, si es
  // CORTESIA, el rol tiene permiso de cortesía → sin autorización.
  const rolCubre = maxRol >= args.porcentajeEfectivo && (args.tipo !== 'CORTESIA' || cortesiaRol);
  if (rolCubre && !args.motivoRequiereAutorizacion) {
    if (args.supervisorAuth || args.codigoAutorizacion) {
      // El cajero mandó autorización innecesariamente — la ignoramos.
    }
    return { autorizadoPorId: null, codigoAutorizacionId: null };
  }

  // Necesita escalado. Hay que tener supervisorAuth o codigoAutorizacion.
  if (args.supervisorAuth) {
    const supervisor = await prisma.usuario.findFirst({
      where: { empresaId: args.empresaId, email: args.supervisorAuth.email, deletedAt: null },
    });
    if (!supervisor) throw Errors.forbidden('Credenciales de supervisor inválidas');
    const ok = await bcrypt.compare(args.supervisorAuth.password, supervisor.passwordHash);
    if (!ok) throw Errors.forbidden('Credenciales de supervisor inválidas');
    if (!supervisor.activo) throw Errors.forbidden('El supervisor está desactivado');

    const limiteSup = await prisma.limiteDescuentoRol.findUnique({
      where: { empresaId_rol: { empresaId: args.empresaId, rol: supervisor.rol } },
    });
    if (!limiteSup?.puedeAutorizarOtros) {
      throw Errors.forbidden(`El rol ${supervisor.rol} no puede autorizar descuentos`);
    }
    if (limiteSup.maxPorcentaje < args.porcentajeEfectivo) {
      throw Errors.forbidden(
        `El supervisor solo puede autorizar hasta ${limiteSup.maxPorcentaje}% — este descuento es ${args.porcentajeEfectivo}%`,
      );
    }
    if (args.tipo === 'CORTESIA' && !limiteSup.puedeUsarCortesia) {
      throw Errors.forbidden('El supervisor no tiene permiso de cortesía');
    }
    return { autorizadoPorId: supervisor.id, codigoAutorizacionId: null };
  }

  if (args.codigoAutorizacion) {
    const codigo = await prisma.codigoAutorizacionDescuento.findUnique({
      where: { empresaId_codigo: { empresaId: args.empresaId, codigo: args.codigoAutorizacion } },
    });
    if (!codigo) throw Errors.forbidden('Código de autorización inválido');
    if (codigo.usadoEn) throw Errors.forbidden('Código ya usado');
    if (codigo.expiraEn < new Date()) throw Errors.forbidden('Código expirado');
    if (codigo.maxPorcentaje < args.porcentajeEfectivo) {
      throw Errors.forbidden(
        `Código autoriza hasta ${codigo.maxPorcentaje}% — este descuento es ${args.porcentajeEfectivo}%`,
      );
    }
    // El uso efectivo lo marca aplicarDescuento dentro de la transacción.
    return { autorizadoPorId: codigo.creadoPorId, codigoAutorizacionId: codigo.id };
  }

  throw Errors.forbidden(
    `Excede tu límite (${maxRol}%) — ingresá credenciales de supervisor o un código de autorización`,
  );
}

// ═════════════════════════════════════════════════════════════════════════
//  APLICAR / REMOVER DESCUENTO
// ═════════════════════════════════════════════════════════════════════════

export async function aplicarDescuento(
  user: UserCtx,
  pedidoId: string,
  input: AplicarDescuentoInput,
) {
  const empresaId = requireEmpresa(user);

  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: {
      id: true,
      empresaId: true,
      estado: true,
      subtotal: true,
      totalIva: true,
      recargoDelivery: true,
      deletedAt: true,
    },
  });
  if (!pedido || pedido.deletedAt) throw Errors.notFound('Pedido no encontrado');
  if (!user.isSuperAdmin && pedido.empresaId !== empresaId) throw Errors.tenantMismatch();
  if (ESTADOS_INMUTABLES.includes(pedido.estado)) {
    throw Errors.conflict(`No se puede modificar el descuento de un pedido ${pedido.estado}`);
  }

  // Si el comprobante ya está EMITIDO no se toca aunque el pedido no esté FACTURADO.
  const tieneComprobante =
    (await prisma.comprobante.count({
      where: { pedidoId, estado: 'EMITIDO', deletedAt: null },
    })) > 0;
  if (tieneComprobante) {
    throw Errors.conflict(
      'No se puede modificar el descuento: el pedido ya tiene comprobante EMITIDO',
    );
  }

  const motivo = await prisma.motivoDescuento.findFirst({
    where: { id: input.motivoDescuentoId, empresaId, deletedAt: null, activo: true },
  });
  if (!motivo) throw Errors.validation({ motivoDescuentoId: 'Motivo inexistente o inactivo' });

  // Base del descuento: subtotal + IVA (no se descuenta el recargo delivery).
  const base = pedido.subtotal + pedido.totalIva;
  const valorBigInt = BigInt(input.valor);
  const { monto, porcentajeEfectivo } = calcularDescuento(input.tipo, valorBigInt, base);

  if (monto <= 0n) {
    throw Errors.validation({ valor: 'El descuento calculado es 0 — revisá tipo y valor' });
  }

  const auth = await validarAutorizacion({
    empresaId,
    user,
    tipo: input.tipo,
    porcentajeEfectivo,
    motivoRequiereAutorizacion: motivo.requiereAutorizacion,
    supervisorAuth: input.supervisorAuth,
    codigoAutorizacion: input.codigoAutorizacion,
  });

  // Persistir en transacción: actualizar pedido + marcar código como usado si aplica.
  return prisma.$transaction(async (tx) => {
    if (auth.codigoAutorizacionId) {
      // Race-free claim: solo marca si todavía está sin usar.
      const claim = await tx.codigoAutorizacionDescuento.updateMany({
        where: { id: auth.codigoAutorizacionId, usadoEn: null },
        data: { usadoEn: new Date() },
      });
      if (claim.count === 0) {
        throw Errors.conflict('El código fue usado en otra operación recién — pedí uno nuevo');
      }
    }

    const nuevoTotal = base + pedido.recargoDelivery - monto;
    const actualizado = await tx.pedido.update({
      where: { id: pedidoId },
      data: {
        descuentoTipo: input.tipo,
        descuentoValor: valorBigInt,
        totalDescuento: monto,
        motivoDescuentoId: input.motivoDescuentoId,
        descuentoObservacion: input.observacion ?? null,
        descuentoAplicadoPorId: user.userId,
        descuentoAutorizadoPorId: auth.autorizadoPorId,
        codigoAutorizacionId: auth.codigoAutorizacionId,
        total: nuevoTotal,
      },
      include: {
        motivoDescuento: { select: { id: true, nombre: true } },
        descuentoAplicadoPor: { select: { id: true, nombreCompleto: true } },
        descuentoAutorizadoPor: { select: { id: true, nombreCompleto: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        empresaId,
        usuarioId: user.userId,
        accion: 'APLICAR_DESCUENTO',
        entidad: 'Pedido',
        entidadId: pedidoId,
        metadata: {
          tipo: input.tipo,
          valorInput: input.valor,
          montoAplicado: monto.toString(),
          porcentajeEfectivo,
          motivoId: input.motivoDescuentoId,
          autorizadoPorId: auth.autorizadoPorId,
          codigoUsadoId: auth.codigoAutorizacionId,
        },
      },
    });

    return actualizado;
  });
}

export async function removerDescuento(user: UserCtx, pedidoId: string) {
  const empresaId = requireEmpresa(user);

  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: {
      id: true,
      empresaId: true,
      estado: true,
      subtotal: true,
      totalIva: true,
      recargoDelivery: true,
      totalDescuento: true,
      descuentoAplicadoPorId: true,
      deletedAt: true,
    },
  });
  if (!pedido || pedido.deletedAt) throw Errors.notFound('Pedido no encontrado');
  if (!user.isSuperAdmin && pedido.empresaId !== empresaId) throw Errors.tenantMismatch();
  if (ESTADOS_INMUTABLES.includes(pedido.estado)) {
    throw Errors.conflict(`No se puede modificar el descuento de un pedido ${pedido.estado}`);
  }
  if (pedido.totalDescuento === 0n) {
    throw Errors.conflict('Este pedido no tiene descuento aplicado');
  }

  // Quién puede sacarlo: ADMIN_EMPRESA, GERENTE_SUCURSAL, SUPER_ADMIN, o el
  // mismo usuario que lo aplicó. Cajero no puede sacar descuento de otro cajero.
  const puedeRemover =
    ROLES_GESTION.includes(user.rol) || pedido.descuentoAplicadoPorId === user.userId;
  if (!puedeRemover) {
    throw Errors.forbidden('Solo el que aplicó el descuento o un supervisor puede sacarlo');
  }

  return prisma.$transaction(async (tx) => {
    const nuevoTotal = pedido.subtotal + pedido.totalIva + pedido.recargoDelivery;
    const actualizado = await tx.pedido.update({
      where: { id: pedidoId },
      data: {
        descuentoTipo: null,
        descuentoValor: 0n,
        totalDescuento: 0n,
        motivoDescuentoId: null,
        descuentoObservacion: null,
        descuentoAplicadoPorId: null,
        descuentoAutorizadoPorId: null,
        codigoAutorizacionId: null,
        total: nuevoTotal,
      },
    });
    await tx.auditLog.create({
      data: {
        empresaId,
        usuarioId: user.userId,
        accion: 'REMOVER_DESCUENTO',
        entidad: 'Pedido',
        entidadId: pedidoId,
        metadata: { montoRevertido: pedido.totalDescuento.toString() },
      },
    });
    return actualizado;
  });
}

// ═════════════════════════════════════════════════════════════════════════
//  Endpoint auxiliar: verificar credenciales de supervisor sin desloguear
// ═════════════════════════════════════════════════════════════════════════

/**
 * Valida credenciales de supervisor y devuelve los límites que puede autorizar.
 * Lo usa el frontend para hacer un "pre-check" en el modal antes de mandar el
 * descuento — UX más amigable que tirar 403 al aplicar.
 */
export async function verificarSupervisor(user: UserCtx, input: VerificarSupervisorInput) {
  const empresaId = requireEmpresa(user);
  const supervisor = await prisma.usuario.findFirst({
    where: { empresaId, email: input.email, deletedAt: null },
    select: { id: true, passwordHash: true, activo: true, rol: true, nombreCompleto: true },
  });
  if (!supervisor) throw Errors.forbidden('Credenciales inválidas');
  const ok = await bcrypt.compare(input.password, supervisor.passwordHash);
  if (!ok) throw Errors.forbidden('Credenciales inválidas');
  if (!supervisor.activo) throw Errors.forbidden('Usuario desactivado');

  const limite = await prisma.limiteDescuentoRol.findUnique({
    where: { empresaId_rol: { empresaId, rol: supervisor.rol } },
  });
  if (!limite?.puedeAutorizarOtros) {
    throw Errors.forbidden(`El rol ${supervisor.rol} no puede autorizar descuentos`);
  }
  return {
    supervisorId: supervisor.id,
    nombreCompleto: supervisor.nombreCompleto,
    rol: supervisor.rol,
    maxPorcentaje: limite.maxPorcentaje,
    puedeUsarCortesia: limite.puedeUsarCortesia,
  };
}

// ═════════════════════════════════════════════════════════════════════════
//  CRUD: MOTIVOS
// ═════════════════════════════════════════════════════════════════════════

export async function listarMotivos(user: UserCtx) {
  const empresaId = requireEmpresa(user);
  return prisma.motivoDescuento.findMany({
    where: { empresaId, deletedAt: null },
    orderBy: [{ ordenMenu: 'asc' }, { nombre: 'asc' }],
  });
}

function assertGestion(user: UserCtx) {
  if (!ROLES_GESTION.includes(user.rol)) throw Errors.forbidden();
}

export async function crearMotivo(user: UserCtx, input: CrearMotivoInput) {
  assertGestion(user);
  const empresaId = requireEmpresa(user);
  const dup = await prisma.motivoDescuento.findFirst({
    where: { empresaId, nombre: input.nombre, deletedAt: null },
  });
  if (dup) throw Errors.conflict(`Ya existe un motivo "${input.nombre}"`);
  return prisma.motivoDescuento.create({
    data: { empresaId, ...input },
  });
}

export async function actualizarMotivo(user: UserCtx, id: string, input: ActualizarMotivoInput) {
  assertGestion(user);
  const empresaId = requireEmpresa(user);
  const motivo = await prisma.motivoDescuento.findFirst({
    where: { id, empresaId, deletedAt: null },
  });
  if (!motivo) throw Errors.notFound('Motivo no encontrado');
  if (input.nombre && input.nombre !== motivo.nombre) {
    const dup = await prisma.motivoDescuento.findFirst({
      where: { empresaId, nombre: input.nombre, deletedAt: null, id: { not: id } },
    });
    if (dup) throw Errors.conflict(`Ya existe un motivo "${input.nombre}"`);
  }
  return prisma.motivoDescuento.update({ where: { id }, data: input });
}

export async function eliminarMotivo(user: UserCtx, id: string) {
  assertGestion(user);
  const empresaId = requireEmpresa(user);
  const motivo = await prisma.motivoDescuento.findFirst({
    where: { id, empresaId, deletedAt: null },
  });
  if (!motivo) throw Errors.notFound('Motivo no encontrado');
  // Soft delete: hay pedidos históricos que pueden referenciarlo.
  await prisma.motivoDescuento.update({
    where: { id },
    data: { deletedAt: new Date(), activo: false },
  });
}

// ═════════════════════════════════════════════════════════════════════════
//  CRUD: LÍMITES POR ROL
// ═════════════════════════════════════════════════════════════════════════

export async function obtenerLimites(user: UserCtx) {
  const empresaId = requireEmpresa(user);
  return prisma.limiteDescuentoRol.findMany({
    where: { empresaId },
    orderBy: { rol: 'asc' },
  });
}

export async function actualizarLimites(user: UserCtx, input: ActualizarLimitesInput) {
  assertGestion(user);
  const empresaId = requireEmpresa(user);
  await prisma.$transaction(
    input.limites.map((l) =>
      prisma.limiteDescuentoRol.upsert({
        where: { empresaId_rol: { empresaId, rol: l.rol } },
        create: {
          empresaId,
          rol: l.rol,
          maxPorcentaje: l.maxPorcentaje,
          puedeAutorizarOtros: l.puedeAutorizarOtros,
          puedeUsarCortesia: l.puedeUsarCortesia,
        },
        update: {
          maxPorcentaje: l.maxPorcentaje,
          puedeAutorizarOtros: l.puedeAutorizarOtros,
          puedeUsarCortesia: l.puedeUsarCortesia,
        },
      }),
    ),
  );
  await prisma.auditLog.create({
    data: {
      empresaId,
      usuarioId: user.userId,
      accion: 'CAMBIO_PERMISO',
      entidad: 'LimiteDescuentoRol',
      metadata: { rolesAfectados: input.limites.map((l) => l.rol) },
    },
  });
  return obtenerLimites(user);
}

// ═════════════════════════════════════════════════════════════════════════
//  CRUD: CÓDIGOS DE AUTORIZACIÓN
// ═════════════════════════════════════════════════════════════════════════

/** Genera código numérico de 8 dígitos. Random.nextInt(10^8) está bien para
 *  el use case (no es criptográfico; el TTL + único uso son la defensa). */
function generarCodigo(): string {
  return String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0');
}

export async function listarCodigos(user: UserCtx, q: ListarCodigosQuery) {
  const empresaId = requireEmpresa(user);
  const ahora = new Date();
  const where =
    q.filtro === 'ACTIVOS'
      ? { empresaId, usadoEn: null, expiraEn: { gt: ahora } }
      : q.filtro === 'USADOS'
        ? { empresaId, usadoEn: { not: null } }
        : q.filtro === 'EXPIRADOS'
          ? { empresaId, usadoEn: null, expiraEn: { lte: ahora } }
          : { empresaId };
  return prisma.codigoAutorizacionDescuento.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { creadoPor: { select: { id: true, nombreCompleto: true } } },
    take: 100,
  });
}

export async function crearCodigo(user: UserCtx, input: CrearCodigoInput) {
  const empresaId = requireEmpresa(user);
  const limite = await prisma.limiteDescuentoRol.findUnique({
    where: { empresaId_rol: { empresaId, rol: user.rol } },
  });
  // Solo roles con permiso de autorizar pueden generar códigos, y solo hasta
  // su propio tope. Caso de uso: gerente genera código de 20% para mandarle al
  // cajero por whatsapp; un admin con maxPorcentaje=100 puede generar cualquier %.
  if (!limite?.puedeAutorizarOtros) {
    throw Errors.forbidden('Tu rol no puede generar códigos de autorización');
  }
  if (input.maxPorcentaje > limite.maxPorcentaje) {
    throw Errors.validation({
      maxPorcentaje: `No podés generar códigos por encima de tu propio límite (${limite.maxPorcentaje}%)`,
    });
  }

  const expiraEn = new Date(Date.now() + input.expiraEnHoras * 60 * 60 * 1000);

  // Retry sobre colisión del código (improbable pero defensivo).
  for (let intento = 0; intento < 5; intento++) {
    const codigo = generarCodigo();
    try {
      return await prisma.codigoAutorizacionDescuento.create({
        data: {
          empresaId,
          codigo,
          maxPorcentaje: input.maxPorcentaje,
          creadoPorId: user.userId,
          expiraEn,
        },
        include: { creadoPor: { select: { id: true, nombreCompleto: true } } },
      });
    } catch (err) {
      // Colisión de código único → retry con código nuevo.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Unique constraint')) throw err;
    }
  }
  throw Errors.conflict('No se pudo generar un código único — intentá de nuevo');
}

export async function eliminarCodigo(user: UserCtx, id: string) {
  assertGestion(user);
  const empresaId = requireEmpresa(user);
  const codigo = await prisma.codigoAutorizacionDescuento.findFirst({
    where: { id, empresaId },
  });
  if (!codigo) throw Errors.notFound('Código no encontrado');
  if (codigo.usadoEn) throw Errors.conflict('No se puede eliminar un código ya usado (histórico)');
  await prisma.codigoAutorizacionDescuento.delete({ where: { id } });
}
