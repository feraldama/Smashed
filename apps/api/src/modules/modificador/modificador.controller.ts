import { z } from 'zod';

import { Errors } from '../../lib/errors.js';

import {
  actualizarGrupoInput,
  actualizarOpcionInput,
  crearGrupoInput,
  crearOpcionInput,
  grupoIdParam,
  opcionIdParam,
  productoVinculoParam,
  vincularProductoInput,
} from './modificador.schemas.js';
import * as service from './modificador.service.js';

import type { Request, Response } from 'express';

const listarQuery = z.object({ busqueda: z.string().trim().min(1).optional() });

function ctx(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

// ───── Grupos ─────

export async function listar(req: Request, res: Response) {
  const c = ctx(req);
  const q = listarQuery.parse(req.query);
  const grupos = await service.listarGrupos(c, q);
  res.json({ grupos });
}

export async function obtener(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = grupoIdParam.parse(req.params);
  const grupo = await service.obtenerGrupo(c, id);
  res.json({ grupo });
}

export async function crear(req: Request, res: Response) {
  const c = ctx(req);
  const input = crearGrupoInput.parse(req.body);
  const grupo = await service.crearGrupo(c, input);
  res.status(201).json({ grupo });
}

export async function actualizar(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = grupoIdParam.parse(req.params);
  const input = actualizarGrupoInput.parse(req.body);
  const grupo = await service.actualizarGrupo(c, id, input);
  res.json({ grupo });
}

export async function eliminar(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = grupoIdParam.parse(req.params);
  await service.eliminarGrupo(c, id);
  res.status(204).send();
}

// ───── Opciones ─────

export async function crearOpcion(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = grupoIdParam.parse(req.params);
  const input = crearOpcionInput.parse(req.body);
  const opcion = await service.crearOpcion(c, id, input);
  res.status(201).json({ opcion });
}

export async function actualizarOpcion(req: Request, res: Response) {
  const c = ctx(req);
  const { id, opcionId } = opcionIdParam.parse(req.params);
  const input = actualizarOpcionInput.parse(req.body);
  const opcion = await service.actualizarOpcion(c, id, opcionId, input);
  res.json({ opcion });
}

export async function eliminarOpcion(req: Request, res: Response) {
  const c = ctx(req);
  const { id, opcionId } = opcionIdParam.parse(req.params);
  await service.eliminarOpcion(c, id, opcionId);
  res.status(204).send();
}

// ───── Vinculación con productos ─────

export async function vincularProducto(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = grupoIdParam.parse(req.params);
  const input = vincularProductoInput.parse(req.body);
  const link = await service.vincularProducto(c, id, input);
  res.status(201).json({ link });
}

export async function desvincularProducto(req: Request, res: Response) {
  const c = ctx(req);
  const { id, productoId } = productoVinculoParam.parse(req.params);
  await service.desvincularProducto(c, id, productoId);
  res.status(204).send();
}
