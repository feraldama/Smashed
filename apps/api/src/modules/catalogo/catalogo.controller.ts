
import { Errors } from '../../lib/errors.js';

import {
  actualizarCategoriaInput,
  actualizarProductoInput,
  categoriaIdParam,
  crearCategoriaInput,
  crearProductoInput,
  listarProductosQuery,
  obtenerProductoParams,
  productoIdParam,
  setComboInput,
  setPrecioSucursalInput,
  setRecetaInput,
} from './catalogo.schemas.js';
import * as service from './catalogo.service.js';

import type { Request, Response } from 'express';

function ctxOrThrow(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  if (!req.context.empresaId && !req.context.isSuperAdmin) {
    throw Errors.forbidden('Usuario sin empresa asignada');
  }
  return req.context;
}

function requireEmpresa(req: Request) {
  const ctx = ctxOrThrow(req);
  if (!ctx.empresaId) throw Errors.forbidden('SUPER_ADMIN debe especificar empresa');
  return { ctx, empresaId: ctx.empresaId };
}

// ───── READ ─────

export async function listarCategorias(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  if (!ctx.empresaId) {
    res.json({ categorias: [] });
    return;
  }
  const categorias = await service.listarCategorias(ctx.empresaId);
  res.json({ categorias });
}

export async function listarProductos(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  if (!ctx.empresaId) {
    res.json({ productos: [] });
    return;
  }
  const filtros = listarProductosQuery.parse(req.query);
  const productos = await service.listarProductos({
    empresaId: ctx.empresaId,
    sucursalId: ctx.sucursalActivaId,
    filtros,
  });
  res.json({ productos, sucursalActivaId: ctx.sucursalActivaId });
}

export async function obtenerProducto(req: Request, res: Response) {
  const ctx = ctxOrThrow(req);
  if (!ctx.empresaId) throw Errors.notFound();
  const { id } = obtenerProductoParams.parse(req.params);
  const producto = await service.obtenerProducto({
    empresaId: ctx.empresaId,
    sucursalId: ctx.sucursalActivaId,
    id,
  });
  res.json({ producto });
}

// ───── WRITE: Categorías ─────

export async function crearCategoria(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const input = crearCategoriaInput.parse(req.body);
  const categoria = await service.crearCategoria(empresaId, input);
  res.status(201).json({ categoria });
}

export async function actualizarCategoria(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id } = categoriaIdParam.parse(req.params);
  const input = actualizarCategoriaInput.parse(req.body);
  const categoria = await service.actualizarCategoria(empresaId, id, input);
  res.json({ categoria });
}

export async function eliminarCategoria(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id } = categoriaIdParam.parse(req.params);
  await service.eliminarCategoria(empresaId, id);
  res.status(204).send();
}

// ───── WRITE: Productos ─────

export async function crearProducto(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const input = crearProductoInput.parse(req.body);
  const producto = await service.crearProducto(empresaId, input);
  res.status(201).json({ producto });
}

export async function actualizarProducto(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id } = productoIdParam.parse(req.params);
  const input = actualizarProductoInput.parse(req.body);
  const producto = await service.actualizarProducto(empresaId, id, input);
  res.json({ producto });
}

export async function eliminarProducto(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id } = productoIdParam.parse(req.params);
  await service.eliminarProducto(empresaId, id);
  res.status(204).send();
}

export async function setPrecioSucursal(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id } = productoIdParam.parse(req.params);
  const input = setPrecioSucursalInput.parse(req.body);
  const precio = await service.setPrecioSucursal(empresaId, id, input);
  res.status(201).json({ precio });
}

export async function setReceta(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id } = productoIdParam.parse(req.params);
  const input = setRecetaInput.parse(req.body);
  const receta = await service.setReceta(empresaId, id, input);
  res.json({ receta });
}

export async function eliminarReceta(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id } = productoIdParam.parse(req.params);
  await service.eliminarReceta(empresaId, id);
  res.status(204).send();
}

export async function setCombo(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id } = productoIdParam.parse(req.params);
  const input = setComboInput.parse(req.body);
  const combo = await service.setCombo(empresaId, id, input);
  res.json({ combo });
}

export async function eliminarCombo(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id } = productoIdParam.parse(req.params);
  await service.eliminarCombo(empresaId, id);
  res.status(204).send();
}
