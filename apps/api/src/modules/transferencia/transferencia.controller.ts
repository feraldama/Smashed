import { Errors } from '../../lib/errors.js';

import {
  crearTransferenciaInput,
  listarTransferenciasQuery,
  transferenciaIdParam,
} from './transferencia.schemas.js';
import * as service from './transferencia.service.js';

import type { Request, Response } from 'express';

function ctx(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

export async function listar(req: Request, res: Response) {
  const c = ctx(req);
  const q = listarTransferenciasQuery.parse(req.query);
  const result = await service.listar(c, q);
  res.json(result);
}

export async function obtener(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = transferenciaIdParam.parse(req.params);
  const transferencia = await service.obtener(c, id);
  res.json({ transferencia });
}

export async function crear(req: Request, res: Response) {
  const c = ctx(req);
  const input = crearTransferenciaInput.parse(req.body);
  const transferencia = await service.crear(c, input);
  res.status(201).json({ transferencia });
}
