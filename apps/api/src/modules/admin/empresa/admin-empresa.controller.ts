import { Errors } from '../../../lib/errors.js';

import {
  cambiarActivaInput,
  crearEmpresaInput,
  listarEmpresasQuery,
} from './admin-empresa.schemas.js';
import * as service from './admin-empresa.service.js';

import type { Request, Response } from 'express';

function ctxOrThrow(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return { userId: req.context.userId, isSuperAdmin: req.context.isSuperAdmin };
}

export async function crear(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const input = crearEmpresaInput.parse(req.body);
  const result = await service.crearEmpresa(ctx, input);
  res.status(201).json(result);
}

export async function listar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const query = listarEmpresasQuery.parse(req.query);
  const result = await service.listarEmpresas(ctx, query);
  res.json(result);
}

export async function obtener(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const empresa = await service.obtenerEmpresaPorId(ctx, req.params.id ?? '');
  res.json({ empresa });
}

export async function cambiarActiva(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const input = cambiarActivaInput.parse(req.body);
  const empresa = await service.cambiarActiva(ctx, req.params.id ?? '', input);
  res.json({ empresa });
}
