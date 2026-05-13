import { Errors } from '../../lib/errors.js';

import { rangoFechasQuery, rentabilidadQuery, stockQuery, topQuery } from './reportes.schemas.js';
import * as service from './reportes.service.js';

import type { Request, Response } from 'express';

function ctx(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  if (!req.context.empresaId) throw Errors.forbidden('Usuario sin empresa');
  return {
    empresaId: req.context.empresaId,
    sucursalActivaId: req.context.sucursalActivaId,
    rol: req.context.rol,
    isSuperAdmin: req.context.isSuperAdmin,
  };
}

export async function resumenVentas(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.resumenVentas(c, q);
  res.json(result);
}

export async function ventasPorDia(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.ventasPorDia(c, q);
  res.json({ series: result });
}

export async function ventasPorHora(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.ventasPorHora(c, q);
  res.json({ celdas: result });
}

export async function topProductos(req: Request, res: Response) {
  const c = ctx(req);
  const q = topQuery.parse(req.query);
  const result = await service.topProductos(c, q);
  res.json({ productos: result });
}

export async function productosRentabilidad(req: Request, res: Response) {
  const c = ctx(req);
  const q = rentabilidadQuery.parse(req.query);
  const result = await service.productosRentabilidad(c, q);
  res.json({ productos: result });
}

export async function topClientes(req: Request, res: Response) {
  const c = ctx(req);
  const q = topQuery.parse(req.query);
  const result = await service.topClientes(c, q);
  res.json({ clientes: result });
}

export async function metodosPago(req: Request, res: Response) {
  const c = ctx(req);
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.metodosPago(c, q);
  res.json({ metodos: result });
}

export async function comparativaSucursales(req: Request, res: Response) {
  const c = ctx(req);
  // Sólo admin de empresa
  if (c.rol !== 'ADMIN_EMPRESA' && !c.isSuperAdmin) {
    throw Errors.forbidden('Sólo admin puede ver comparativa de sucursales');
  }
  const q = rangoFechasQuery.parse(req.query);
  const result = await service.comparativaSucursales(c, q);
  res.json({ sucursales: result });
}

export async function stockBajo(req: Request, res: Response) {
  const c = ctx(req);
  const q = stockQuery.parse(req.query);
  const result = await service.stockBajo(c, q);
  res.json({ alertas: result });
}

export async function valuacionInventario(req: Request, res: Response) {
  const c = ctx(req);
  const q = stockQuery.parse(req.query);
  const result = await service.valuacionInventario(c, q);
  res.json(result);
}

export async function dashboard(req: Request, res: Response) {
  const c = ctx(req);
  const sucursalId = typeof req.query.sucursalId === 'string' ? req.query.sucursalId : undefined;
  const result = await service.dashboardSnapshot(c, sucursalId);
  res.json(result);
}
