
import { Errors } from '../../lib/errors.js';

import {
  anularComprobanteInput,
  comprobanteIdParam,
  emitirComprobanteInput,
  listarComprobantesQuery,
} from './comprobante.schemas.js';
import * as service from './comprobante.service.js';

import type { Request, Response } from 'express';

function ctxOrThrow(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

export async function emitir(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const input = emitirComprobanteInput.parse(req.body);
  const comprobante = await service.emitirComprobante(ctx, input);
  res.status(201).json({ comprobante });
}

export async function anular(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = comprobanteIdParam.parse(req.params);
  const input = anularComprobanteInput.parse(req.body);
  const comprobante = await service.anularComprobante(ctx, id, input);
  res.json({ comprobante });
}

export async function listar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const q = listarComprobantesQuery.parse(req.query);
  const result = await service.listarComprobantes(ctx, q);
  res.json(result);
}

export async function detalle(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = comprobanteIdParam.parse(req.params);
  const comprobante = await service.obtenerComprobante(ctx, id);
  res.json({ comprobante });
}
