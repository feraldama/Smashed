import { Errors } from '../../lib/errors.js';

import { listarAuditoriaQuery } from './auditoria.schemas.js';
import * as service from './auditoria.service.js';

import type { Request, Response } from 'express';

function ctx(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  if (!req.context.empresaId) throw Errors.forbidden('Usuario sin empresa');
  return { empresaId: req.context.empresaId };
}

export async function listar(req: Request, res: Response) {
  const c = ctx(req);
  const q = listarAuditoriaQuery.parse(req.query);
  const result = await service.listarAuditoria(c, q);
  res.json(result);
}
