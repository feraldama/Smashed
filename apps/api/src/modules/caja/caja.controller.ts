
import { Errors } from '../../lib/errors.js';

import {
  abrirCajaSchema,
  aperturaIdParam,
  cajaIdParam,
  cerrarCajaSchema,
  movimientoCajaSchema,
} from './caja.schemas.js';
import * as service from './caja.service.js';

import type { Request, Response } from 'express';

function ctxOrThrow(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

export async function listarCajas(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const cajas = await service.listarCajas(ctx);
  res.json({ cajas });
}

export async function aperturaActiva(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const apertura = await service.obtenerAperturaActivaDelUser(ctx);
  res.json({ apertura });
}

export async function obtenerApertura(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { aperturaId } = aperturaIdParam.parse(req.params);
  const apertura = await service.obtenerApertura(ctx, aperturaId);
  res.json({ apertura });
}

export async function abrirCaja(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { cajaId } = cajaIdParam.parse(req.params);
  const input = abrirCajaSchema.parse(req.body);
  const apertura = await service.abrirCaja(ctx, cajaId, input, { ip: req.ip });
  res.status(201).json({ apertura });
}

export async function cerrarCaja(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { aperturaId } = aperturaIdParam.parse(req.params);
  const input = cerrarCajaSchema.parse(req.body);
  const cierre = await service.cerrarCaja(ctx, aperturaId, input, { ip: req.ip });
  res.json({ cierre });
}

export async function movimiento(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { aperturaId } = aperturaIdParam.parse(req.params);
  const input = movimientoCajaSchema.parse(req.body);
  const mov = await service.registrarMovimiento(ctx, aperturaId, input);
  res.status(201).json({ movimiento: mov });
}
