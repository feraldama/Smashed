
import { Errors } from '../../lib/errors.js';

import { cancelarSifenInput, comprobanteIdParam } from './sifen.schemas.js';
import * as service from './sifen.service.js';

import type { Request, Response } from 'express';

function ctxOrThrow(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

export async function enviar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = comprobanteIdParam.parse(req.params);
  const result = await service.enviarComprobante(ctx, id);
  res.status(202).json(result);
}

export async function cancelar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = comprobanteIdParam.parse(req.params);
  const input = cancelarSifenInput.parse(req.body);
  const result = await service.cancelarComprobante(ctx, id, input.motivo);
  res.json(result);
}

export async function estado(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = comprobanteIdParam.parse(req.params);
  const result = await service.consultarEstado(ctx, id);
  res.json(result);
}
