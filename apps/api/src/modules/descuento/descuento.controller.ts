import { z } from 'zod';

import { Errors } from '../../lib/errors.js';

import {
  actualizarLimitesInput,
  actualizarMotivoInput,
  aplicarDescuentoInput,
  codigoIdParam,
  crearCodigoInput,
  crearMotivoInput,
  listarCodigosQuery,
  motivoIdParam,
  verificarSupervisorInput,
} from './descuento.schemas.js';
import * as service from './descuento.service.js';

import type { Request, Response } from 'express';

const pedidoIdParam = z.object({ id: z.string().cuid() });

function ctxOrThrow(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

// ───── Aplicar / remover descuento ─────

export async function aplicar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = pedidoIdParam.parse(req.params);
  const input = aplicarDescuentoInput.parse(req.body);
  const pedido = await service.aplicarDescuento(ctx, id, input);
  res.json({ pedido });
}

export async function remover(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = pedidoIdParam.parse(req.params);
  const pedido = await service.removerDescuento(ctx, id);
  res.json({ pedido });
}

// ───── Verificar supervisor ─────

export async function verificarSupervisor(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const input = verificarSupervisorInput.parse(req.body);
  const result = await service.verificarSupervisor(ctx, input);
  res.json(result);
}

// ───── Motivos ─────

export async function listarMotivos(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const motivos = await service.listarMotivos(ctx);
  res.json({ motivos });
}

export async function crearMotivo(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const input = crearMotivoInput.parse(req.body);
  const motivo = await service.crearMotivo(ctx, input);
  res.status(201).json({ motivo });
}

export async function actualizarMotivo(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = motivoIdParam.parse(req.params);
  const input = actualizarMotivoInput.parse(req.body);
  const motivo = await service.actualizarMotivo(ctx, id, input);
  res.json({ motivo });
}

export async function eliminarMotivo(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = motivoIdParam.parse(req.params);
  await service.eliminarMotivo(ctx, id);
  res.status(204).end();
}

// ───── Límites por rol ─────

export async function obtenerLimites(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const limites = await service.obtenerLimites(ctx);
  res.json({ limites });
}

export async function actualizarLimites(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const input = actualizarLimitesInput.parse(req.body);
  const limites = await service.actualizarLimites(ctx, input);
  res.json({ limites });
}

// ───── Códigos ─────

export async function listarCodigos(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const q = listarCodigosQuery.parse(req.query);
  const codigos = await service.listarCodigos(ctx, q);
  res.json({ codigos });
}

export async function crearCodigo(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const input = crearCodigoInput.parse(req.body);
  const codigo = await service.crearCodigo(ctx, input);
  res.status(201).json({ codigo });
}

export async function eliminarCodigo(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = codigoIdParam.parse(req.params);
  await service.eliminarCodigo(ctx, id);
  res.status(204).end();
}
