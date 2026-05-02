
import { Errors } from '../../lib/errors.js';

import {
  actualizarInsumoInput,
  ajustarStockInput,
  crearInsumoInput,
  insumoIdParam,
  listarInsumosQuery,
  setStockMinimosInput,
} from './inventario.schemas.js';
import * as service from './inventario.service.js';

import type { Request, Response } from 'express';

function ctx(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  if (!req.context.empresaId) throw Errors.forbidden('Usuario sin empresa');
  return {
    userId: req.context.userId,
    empresaId: req.context.empresaId,
    sucursalActivaId: req.context.sucursalActivaId,
    isSuperAdmin: req.context.isSuperAdmin,
  };
}

export async function listar(req: Request, res: Response) {
  const c = ctx(req);
  const q = listarInsumosQuery.parse(req.query);
  const sucursalParam = typeof req.query.sucursalId === 'string' ? req.query.sucursalId : undefined;
  const sucursalId = sucursalParam ?? c.sucursalActivaId ?? undefined;
  const insumos = await service.listarInsumos(c.empresaId, q, sucursalId);
  res.json({ insumos, sucursalAplicada: sucursalId ?? null });
}

export async function obtener(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = insumoIdParam.parse(req.params);
  const insumo = await service.obtenerInsumo(c.empresaId, id);
  res.json({ insumo });
}

export async function crear(req: Request, res: Response) {
  const c = ctx(req);
  const input = crearInsumoInput.parse(req.body);
  const insumo = await service.crearInsumo(c.empresaId, input);
  res.status(201).json({ insumo });
}

export async function actualizar(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = insumoIdParam.parse(req.params);
  const input = actualizarInsumoInput.parse(req.body);
  const insumo = await service.actualizarInsumo(c.empresaId, id, input);
  res.json({ insumo });
}

export async function eliminar(req: Request, res: Response) {
  const c = ctx(req);
  const { id } = insumoIdParam.parse(req.params);
  await service.eliminarInsumo(c.empresaId, id);
  res.status(204).send();
}

export async function ajustarStock(req: Request, res: Response) {
  const c = ctx(req);
  const input = ajustarStockInput.parse(req.body);
  const stock = await service.ajustarStock(c, input);
  res.status(201).json({ stock });
}

export async function setStockLimites(req: Request, res: Response) {
  const c = ctx(req);
  const input = setStockMinimosInput.parse(req.body);
  const stock = await service.setStockLimites(c.empresaId, input);
  res.json({ stock });
}
