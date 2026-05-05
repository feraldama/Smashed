import { Errors } from '../../lib/errors.js';

import { compraIdParam, crearCompraInput, listarComprasQuery } from './compra.schemas.js';
import * as service from './compra.service.js';

import type { Request, Response } from 'express';

function ctx(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

export async function listar(req: Request, res: Response) {
  const c = ctx(req);
  const q = listarComprasQuery.parse(req.query);
  const result = await service.listar(c, q);
  res.json(result);
}

export async function obtener(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = compraIdParam.parse(req.params);
  const compra = await service.obtener(c, id);
  res.json({ compra });
}

export async function crear(req: Request, res: Response) {
  const c = ctx(req);
  const input = crearCompraInput.parse(req.body);
  const compra = await service.crear(c, input);
  res.status(201).json({ compra });
}

export async function eliminar(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = compraIdParam.parse(req.params);
  await service.eliminar(c, id);
  res.status(204).end();
}
