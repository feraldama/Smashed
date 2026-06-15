import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import * as docService from './documento.service.js';
import { guardarConfiguracion } from './facturacion-config.service.js';
import {
  cancelarSchema,
  comprobanteIdParam,
  guardarConfiguracionSchema,
  kudeQuery,
} from './facturacion.schemas.js';

import type { Request, Response } from 'express';

function ctxOrThrow(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

function empresaIdOrThrow(req: Request): string {
  const ctx = ctxOrThrow(req);
  if (!ctx.empresaId) throw Errors.forbidden('Usuario sin empresa');
  return ctx.empresaId;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Configuración de facturación (admin)
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerConfig(req: Request, res: Response) {
  const empresaId = empresaIdOrThrow(req);
  const cfg = await prisma.configuracionFacturacion.findUnique({ where: { empresaId } });
  if (!cfg) {
    res.json({ configurado: false });
    return;
  }
  // Nunca exponer los passwords: sólo un flag de "ya hay password cargado".
  res.json({
    configurado: true,
    proveedor: cfg.proveedor,
    ambienteActivo: cfg.ambienteActivo,
    emisorTipoContribuyente: cfg.emisorTipoContribuyente,
    activo: cfg.activo,
    test: {
      dominio: cfg.testDominio,
      ruc: cfg.testRuc,
      tienePassword: Boolean(cfg.testPassword),
    },
    prod: {
      dominio: cfg.prodDominio,
      ruc: cfg.prodRuc,
      tienePassword: Boolean(cfg.prodPassword),
    },
    updatedAt: cfg.updatedAt,
  });
}

export async function guardarConfig(req: Request, res: Response) {
  const empresaId = empresaIdOrThrow(req);
  const body = guardarConfiguracionSchema.parse(req.body);
  const cfg = await guardarConfiguracion(empresaId, body);
  res.json(cfg);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Documento electrónico por comprobante
// ─────────────────────────────────────────────────────────────────────────────

export async function kude(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = comprobanteIdParam.parse(req.params);
  const { ticket } = kudeQuery.parse(req.query);
  const result = await docService.obtenerKude(ctx, id, ticket);
  res.json(result);
}

export async function xml(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = comprobanteIdParam.parse(req.params);
  const result = await docService.obtenerXml(ctx, id);
  res.json(result);
}

export async function estado(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = comprobanteIdParam.parse(req.params);
  const result = await docService.consultarEstado(ctx, id);
  res.json(result);
}

export async function reenviar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = comprobanteIdParam.parse(req.params);
  const result = await docService.reenviar(ctx, id);
  res.status(202).json(result);
}

export async function cancelar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = comprobanteIdParam.parse(req.params);
  const { motivo } = cancelarSchema.parse(req.body);
  const result = await docService.cancelar(ctx, id, motivo);
  res.json(result);
}
