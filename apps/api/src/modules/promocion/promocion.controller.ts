import { Errors } from '../../lib/errors.js';

import {
  actualizarPromocionInput,
  crearPromocionInput,
  listarPromocionesQuery,
  promocionIdParam,
  vigentesQuery,
} from './promocion.schemas.js';
import * as service from './promocion.service.js';

import type { Request, Response } from 'express';

function ctxOrThrow(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

export async function listar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const q = listarPromocionesQuery.parse(req.query);
  const promociones = await service.listar(ctx, q);
  res.json({ promociones });
}

export async function obtener(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = promocionIdParam.parse(req.params);
  const promocion = await service.obtener(ctx, id);
  res.json({ promocion });
}

export async function crear(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const input = crearPromocionInput.parse(req.body);
  const promocion = await service.crear(ctx, input);
  res.status(201).json({ promocion });
}

export async function actualizar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = promocionIdParam.parse(req.params);
  const input = actualizarPromocionInput.parse(req.body);
  const promocion = await service.actualizar(ctx, id, input);
  res.json({ promocion });
}

export async function eliminar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = promocionIdParam.parse(req.params);
  await service.eliminar(ctx, id);
  res.status(204).end();
}

export async function listarVigentes(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const q = vigentesQuery.parse(req.query);
  const promociones = await service.listarVigentes(ctx, q);
  res.json({ promociones });
}
