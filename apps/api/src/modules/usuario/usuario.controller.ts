import type { Request, Response } from 'express';

import { Errors } from '../../lib/errors.js';

import {
  actualizarUsuarioInput,
  crearUsuarioInput,
  listarUsuariosQuery,
  resetPasswordInput,
  usuarioIdParam,
} from './usuario.schemas.js';
import * as service from './usuario.service.js';

function ctxOrThrow(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

export async function listar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const q = listarUsuariosQuery.parse(req.query);
  const result = await service.listarUsuarios(ctx, q);
  res.json(result);
}

export async function detalle(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = usuarioIdParam.parse(req.params);
  const usuario = await service.obtenerUsuario(ctx, id);
  res.json({ usuario });
}

export async function crear(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const input = crearUsuarioInput.parse(req.body);
  const usuario = await service.crearUsuario(ctx, input);
  res.status(201).json({ usuario });
}

export async function actualizar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = usuarioIdParam.parse(req.params);
  const input = actualizarUsuarioInput.parse(req.body);
  const usuario = await service.actualizarUsuario(ctx, id, input);
  res.json({ usuario });
}

export async function resetPassword(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = usuarioIdParam.parse(req.params);
  const input = resetPasswordInput.parse(req.body);
  const result = await service.resetPassword(ctx, id, input);
  res.json(result);
}

export async function eliminar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = usuarioIdParam.parse(req.params);
  const result = await service.eliminarUsuario(ctx, id);
  res.json(result);
}
