
import { Errors } from '../../lib/errors.js';

import { cambiarEstadoMesaInput, mesaIdParam } from './mesa.schemas.js';
import * as service from './mesa.service.js';

import type { Request, Response } from 'express';

function ctx(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

export async function listar(req: Request, res: Response) {
  const c = ctx(req);
  const result = await service.listarMesas(c);
  res.json(result);
}

export async function cambiarEstado(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = mesaIdParam.parse(req.params);
  const { estado } = cambiarEstadoMesaInput.parse(req.body);
  const mesa = await service.cambiarEstadoMesa(c, id, estado);
  res.json({ mesa });
}
