import { Errors } from '../../lib/errors.js';

import {
  actualizarMesaInput,
  actualizarZonaInput,
  cambiarEstadoMesaInput,
  crearMesaInput,
  crearZonaInput,
  mesaIdParam,
} from './mesa.schemas.js';
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

// ───── Zonas ─────

export async function crearZona(req: Request, res: Response) {
  const c = ctx(req);
  const input = crearZonaInput.parse(req.body);
  const zona = await service.crearZona(c, input);
  res.status(201).json({ zona });
}

export async function actualizarZona(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = mesaIdParam.parse(req.params);
  const input = actualizarZonaInput.parse(req.body);
  const zona = await service.actualizarZona(c, id, input);
  res.json({ zona });
}

export async function eliminarZona(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = mesaIdParam.parse(req.params);
  await service.eliminarZona(c, id);
  res.status(204).send();
}

// ───── Mesas ─────

export async function crearMesa(req: Request, res: Response) {
  const c = ctx(req);
  const input = crearMesaInput.parse(req.body);
  const mesa = await service.crearMesa(c, input);
  res.status(201).json({ mesa });
}

export async function actualizarMesa(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = mesaIdParam.parse(req.params);
  const input = actualizarMesaInput.parse(req.body);
  const mesa = await service.actualizarMesa(c, id, input);
  res.json({ mesa });
}

export async function eliminarMesa(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = mesaIdParam.parse(req.params);
  await service.eliminarMesa(c, id);
  res.status(204).send();
}
