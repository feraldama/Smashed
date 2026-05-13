import bcrypt from 'bcrypt';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { Errors } from '../../lib/errors.js';
import {
  hashToken,
  parseDurationToMs,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt.js';
import { prisma } from '../../lib/prisma.js';
import { obtenerMenusPermitidos } from '../menuRol/menuRol.service.js';

import type { LoginInput } from './auth.schemas.js';
import type { Rol } from '@prisma/client';

/**
 * Servicio de autenticación.
 *
 * Estrategia de refresh tokens:
 *  - El refresh se hashea (SHA-256) antes de persistir. Nunca guardamos el raw.
 *  - Cada uso del refresh **rota** el token: crea uno nuevo y revoca el viejo
 *    apuntando con `reemplazadoPorId`.
 *  - Si llega un refresh ya REVOCADO, asumimos robo y revocamos toda la cadena
 *    descendiente (defensa en profundidad).
 *  - El logout revoca el refresh actual.
 */

interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export async function login(input: LoginInput, meta: ClientMeta) {
  const usuario = await prisma.usuario.findFirst({
    where: { email: input.email, deletedAt: null, activo: true },
    include: {
      empresa: { select: { activa: true, motivoInactiva: true, nombreFantasia: true } },
      sucursales: {
        include: {
          sucursal: { select: { id: true, nombre: true, codigo: true, establecimiento: true } },
        },
      },
    },
  });

  if (!usuario) throw Errors.invalidCredentials();

  const ok = await bcrypt.compare(input.password, usuario.passwordHash);
  if (!ok) {
    logger.warn({ email: input.email, ip: meta.ip }, 'Login fallido');
    throw Errors.invalidCredentials();
  }

  // Empresa suspendida → bloqueamos login. SUPER_ADMIN no tiene empresa, sigue.
  if (usuario.empresa && !usuario.empresa.activa) {
    throw Errors.empresaInactiva(usuario.empresa.motivoInactiva);
  }

  // Sucursal activa por default: la marcada como principal, o la primera, o null.
  const sucursalActivaId =
    usuario.sucursales.find((s) => s.esPrincipal)?.sucursalId ??
    usuario.sucursales[0]?.sucursalId ??
    null;

  const accessToken = signAccessToken({
    userId: usuario.id,
    empresaId: usuario.empresaId,
    rol: usuario.rol,
    sucursalActivaId,
  });
  const refresh = await issueRefreshToken(usuario.id, meta);

  // Fire-and-forget: actualizar último login + auditar.
  void prisma.usuario
    .update({ where: { id: usuario.id }, data: { ultimoLogin: new Date() } })
    .catch(() => {
      /* ignorar */
    });
  void prisma.auditLog
    .create({
      data: {
        empresaId: usuario.empresaId,
        usuarioId: usuario.id,
        accion: 'LOGIN',
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    })
    .catch(() => {
      /* ignorar */
    });

  const menusPermitidos = await obtenerMenusPermitidos(usuario.empresaId, usuario.rol);

  return {
    accessToken,
    refreshToken: refresh.token,
    refreshExpiresInMs: parseDurationToMs(env.JWT_REFRESH_TTL),
    user: {
      id: usuario.id,
      email: usuario.email,
      nombreCompleto: usuario.nombreCompleto,
      rol: usuario.rol,
      empresaId: usuario.empresaId,
      empresaNombre: usuario.empresa?.nombreFantasia ?? null,
      sucursales: usuario.sucursales.map((us) => ({
        id: us.sucursal.id,
        nombre: us.sucursal.nombre,
        codigo: us.sucursal.codigo,
        establecimiento: us.sucursal.establecimiento,
        esPrincipal: us.esPrincipal,
      })),
      sucursalActivaId,
      menusPermitidos,
    },
  };
}

export async function refresh(
  rawToken: string,
  meta: ClientMeta,
  hint?: { sucursalActivaId?: string; empresaIdOperar?: string },
) {
  const payload = verifyRefreshToken(rawToken);
  const tokenHash = hashToken(rawToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      usuario: {
        include: {
          empresa: { select: { activa: true, motivoInactiva: true } },
          sucursales: { select: { sucursalId: true, esPrincipal: true } },
        },
      },
    },
  });

  if (!stored) throw Errors.tokenInvalid();

  // Token revocado → posible reuse attack: revocar TODA la cadena descendiente del usuario.
  if (stored.revocadoEn) {
    logger.warn(
      { userId: stored.usuarioId, ip: meta.ip },
      'Refresh token revocado reutilizado — revocando cadena',
    );
    await prisma.refreshToken.updateMany({
      where: { usuarioId: stored.usuarioId, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
    throw Errors.tokenRevoked();
  }

  if (stored.expiraEn < new Date()) throw Errors.tokenExpired();
  if (stored.usuario.id !== payload.sub) throw Errors.tokenInvalid();
  if (!stored.usuario.activo || stored.usuario.deletedAt) throw Errors.unauthorized();

  // Empresa suspendida → revocamos el refresh actual y rechazamos. El access
  // token vivo se va a vencer solo en ≤15 min sin que podamos rotarlo.
  if (stored.usuario.empresa && !stored.usuario.empresa.activa) {
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revocadoEn: new Date() },
    });
    throw Errors.empresaInactiva(stored.usuario.empresa.motivoInactiva);
  }

  // Rotación: emitir nuevo refresh + revocar el viejo apuntándolo al sucesor
  const nuevo = await issueRefreshToken(stored.usuario.id, meta);
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revocadoEn: new Date(), reemplazadoPorId: nuevo.id },
  });

  // Sucursal activa: si el cliente pasa un hint y todavía es accesible, mantenerlo.
  // SUPER_ADMIN no tiene `UsuarioSucursal` rows — le aceptamos cualquier sucursalId
  // que el cliente mande, sin re-verificar acceso (su rol ya lo permite).
  const accesibles = new Set(stored.usuario.sucursales.map((s) => s.sucursalId));
  const isSuperAdmin = stored.usuario.rol === 'SUPER_ADMIN';
  const hintAceptable =
    hint?.sucursalActivaId && (isSuperAdmin || accesibles.has(hint.sucursalActivaId))
      ? hint.sucursalActivaId
      : null;

  // empresaId del nuevo access token: por default el del usuario (null para
  // SUPER_ADMIN). Si es SUPER_ADMIN y mandó hint `empresaIdOperar`, validamos
  // que la empresa exista y esté activa, y la usamos para preservar el modo
  // "operar como empresa X" cuando se le vence el access token.
  let empresaIdParaToken = stored.usuario.empresaId;
  if (isSuperAdmin && hint?.empresaIdOperar) {
    const target = await prisma.empresa.findUnique({
      where: { id: hint.empresaIdOperar },
      select: { id: true, activa: true, deletedAt: true },
    });
    if (target && target.activa && !target.deletedAt) {
      empresaIdParaToken = target.id;
    }
  }

  const sucursalActivaId =
    hintAceptable ??
    stored.usuario.sucursales.find((s) => s.esPrincipal)?.sucursalId ??
    stored.usuario.sucursales[0]?.sucursalId ??
    null;

  const accessToken = signAccessToken({
    userId: stored.usuario.id,
    empresaId: empresaIdParaToken,
    rol: stored.usuario.rol,
    sucursalActivaId,
  });

  return {
    accessToken,
    refreshToken: nuevo.token,
    refreshExpiresInMs: parseDurationToMs(env.JWT_REFRESH_TTL),
    sucursalActivaId,
    empresaId: empresaIdParaToken,
  };
}

export async function logout(rawToken: string | undefined) {
  if (!rawToken) return;
  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken
    .updateMany({ where: { tokenHash, revocadoEn: null }, data: { revocadoEn: new Date() } })
    .catch(() => {
      /* idempotente */
    });
}

export async function me(userId: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: userId },
    include: {
      sucursales: {
        include: {
          sucursal: { select: { id: true, nombre: true, codigo: true, establecimiento: true } },
        },
      },
      empresa: { select: { id: true, nombreFantasia: true, razonSocial: true } },
    },
  });
  if (!usuario || usuario.deletedAt || !usuario.activo) throw Errors.unauthorized();

  const menusPermitidos = await obtenerMenusPermitidos(usuario.empresaId, usuario.rol);

  return {
    id: usuario.id,
    email: usuario.email,
    nombreCompleto: usuario.nombreCompleto,
    rol: usuario.rol,
    empresa: usuario.empresa,
    sucursales: usuario.sucursales.map((us) => ({
      id: us.sucursal.id,
      nombre: us.sucursal.nombre,
      codigo: us.sucursal.codigo,
      establecimiento: us.sucursal.establecimiento,
      esPrincipal: us.esPrincipal,
    })),
    menusPermitidos,
  };
}

export async function seleccionarSucursal(args: {
  userId: string;
  empresaId: string | null;
  rol: Rol;
  isSuperAdmin: boolean;
  sucursalId: string;
}) {
  // Verificar acceso: SUPER_ADMIN puede entrar a cualquiera; otros solo a las suyas.
  if (!args.isSuperAdmin) {
    const link = await prisma.usuarioSucursal.findUnique({
      where: { usuarioId_sucursalId: { usuarioId: args.userId, sucursalId: args.sucursalId } },
    });
    if (!link) throw Errors.sucursalNoAutorizada();
  } else {
    // SUPER_ADMIN: aún así verificamos que la sucursal exista.
    const exists = await prisma.sucursal.findUnique({ where: { id: args.sucursalId } });
    if (!exists) throw Errors.notFound('Sucursal no encontrada');
  }

  // Reemitir el access token con la nueva sucursal activa
  const accessToken = signAccessToken({
    userId: args.userId,
    empresaId: args.empresaId,
    rol: args.rol,
    sucursalActivaId: args.sucursalId,
  });

  return { accessToken, sucursalActivaId: args.sucursalId };
}

// ───── helpers privados ─────

async function issueRefreshToken(userId: string, meta: ClientMeta) {
  const { token, tokenHash, jti } = signRefreshToken(userId);
  const expiraEn = new Date(Date.now() + parseDurationToMs(env.JWT_REFRESH_TTL));
  const created = await prisma.refreshToken.create({
    data: {
      usuarioId: userId,
      tokenHash,
      expiraEn,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
  return { id: created.id, token, jti };
}
