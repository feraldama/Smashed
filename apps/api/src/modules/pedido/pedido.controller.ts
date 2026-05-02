
import { Errors } from '../../lib/errors.js';

import {
  agregarItemsInput,
  cancelarPedidoInput,
  crearPedidoInput,
  itemEstadoInput,
  itemIdParam,
  listarPedidosQuery,
  pedidoIdParam,
  transicionEstadoInput,
} from './pedido.schemas.js';
import * as service from './pedido.service.js';

import type { Request, Response } from 'express';

function ctxOrThrow(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  return req.context;
}

export async function crear(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const input = crearPedidoInput.parse(req.body);
  const pedido = await service.crearPedido(ctx, input);
  res.status(201).json({ pedido });
}

export async function listar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const q = listarPedidosQuery.parse(req.query);
  const result = await service.listarPedidos(ctx, q);
  res.json(result);
}

export async function detalle(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = pedidoIdParam.parse(req.params);
  const pedido = await service.obtenerPedido(ctx, id);
  res.json({ pedido });
}

export async function confirmar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = pedidoIdParam.parse(req.params);
  const pedido = await service.confirmarPedido(ctx, id);
  res.json({ pedido });
}

export async function transicionar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = pedidoIdParam.parse(req.params);
  const input = transicionEstadoInput.parse(req.body);
  const pedido = await service.transicionarEstado(ctx, id, input);
  res.json({ pedido });
}

export async function cancelar(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = pedidoIdParam.parse(req.params);
  const input = cancelarPedidoInput.parse(req.body);
  const pedido = await service.cancelarPedido(ctx, id, input);
  res.json({ pedido });
}

export async function cambiarEstadoItem(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id, itemId } = itemIdParam.parse(req.params);
  const { estado } = itemEstadoInput.parse(req.body);
  const result = await service.cambiarEstadoItem(ctx, id, itemId, estado);
  res.json(result);
}

export async function listarKds(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const result = await service.listarPedidosParaKds(ctx);
  res.json(result);
}

export async function agregarItems(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  const { id } = pedidoIdParam.parse(req.params);
  const input = agregarItemsInput.parse(req.body);
  const pedido = await service.agregarItemsAPedido(ctx, id, input);
  res.json({ pedido });
}
