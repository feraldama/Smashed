import { Errors } from '../../lib/errors.js';

import { actualizarMatrizInput } from './menuRol.schemas.js';
import * as service from './menuRol.service.js';

import type { Request, Response } from 'express';

function ctx(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

export async function obtenerMatriz(req: Request, res: Response) {
  const c = ctx(req);
  const matriz = await service.obtenerMatriz(c);
  res.json(matriz);
}

export async function actualizarMatriz(req: Request, res: Response) {
  const c = ctx(req);
  const input = actualizarMatrizInput.parse(req.body);
  const matriz = await service.actualizarMatriz(c, input);
  res.json(matriz);
}

export async function resetearMatriz(req: Request, res: Response) {
  const c = ctx(req);
  const matriz = await service.resetearMatriz(c);
  res.json(matriz);
}
