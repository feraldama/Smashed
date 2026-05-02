import { Errors } from '../../lib/errors.js';

import { actualizarConfiguracionInput, actualizarEmpresaInput } from './empresa.schemas.js';
import * as service from './empresa.service.js';

import type { Request, Response } from 'express';

function ctxOrThrow(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

export async function obtener(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const empresa = await service.obtenerEmpresa(ctx);
  res.json({ empresa });
}

export async function actualizar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const input = actualizarEmpresaInput.parse(req.body);
  const empresa = await service.actualizarEmpresa(ctx, input);
  res.json({ empresa });
}

export async function actualizarConfig(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const input = actualizarConfiguracionInput.parse(req.body);
  const empresa = await service.actualizarConfiguracion(ctx, input);
  res.json({ empresa });
}
