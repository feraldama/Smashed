import { Errors } from '../../lib/errors.js';

import {
  cambiarModoStockInput,
  listarSubpreparacionesQuery,
  producirLoteInput,
  subpreparacionIdParam,
} from './subpreparacion.schemas.js';
import * as service from './subpreparacion.service.js';

import type { Request, Response } from 'express';

function ctx(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

export async function listar(req: Request, res: Response) {
  const c = ctx(req);
  const q = listarSubpreparacionesQuery.parse(req.query);
  const subpreparaciones = await service.listarSubpreparaciones(c, q);
  res.json({ subpreparaciones });
}

export async function cambiarModoStock(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = subpreparacionIdParam.parse(req.params);
  const input = cambiarModoStockInput.parse(req.body);
  const receta = await service.cambiarModoStock(c, id, input);
  res.json({ receta });
}

export async function producirLote(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = subpreparacionIdParam.parse(req.params);
  const input = producirLoteInput.parse(req.body);
  const resultado = await service.producirLote(c, id, input);
  res.status(201).json({ produccion: resultado });
}
