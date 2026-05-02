import { Errors } from '../../lib/errors.js';

import {
  actualizarSucursalInput,
  crearSucursalInput,
  sucursalIdParam,
} from './sucursal.schemas.js';
import * as service from './sucursal.service.js';

import type { Request, Response } from 'express';

function ctxOrThrow(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

export async function listar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const result = await service.listarSucursales(ctx);
  res.json(result);
}

export async function detalle(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = sucursalIdParam.parse(req.params);
  const sucursal = await service.obtenerSucursal(ctx, id);
  res.json({ sucursal });
}

export async function crear(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const input = crearSucursalInput.parse(req.body);
  const sucursal = await service.crearSucursal(ctx, input);
  res.status(201).json({ sucursal });
}

export async function actualizar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = sucursalIdParam.parse(req.params);
  const input = actualizarSucursalInput.parse(req.body);
  const sucursal = await service.actualizarSucursal(ctx, id, input);
  res.json({ sucursal });
}

export async function eliminar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = sucursalIdParam.parse(req.params);
  const result = await service.eliminarSucursal(ctx, id);
  res.json(result);
}

export async function puntosExpedicion(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = sucursalIdParam.parse(req.params);
  const puntos = await service.listarPuntosExpedicion(ctx, id);
  res.json({ puntos });
}
