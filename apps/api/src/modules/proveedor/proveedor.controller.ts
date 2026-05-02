
import { Errors } from '../../lib/errors.js';

import {
  actualizarProveedorInput,
  crearProveedorInput,
  listarProveedoresQuery,
  proveedorIdParam,
} from './proveedor.schemas.js';
import * as service from './proveedor.service.js';

import type { Request, Response } from 'express';

function requireEmpresa(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  if (!req.context.empresaId) throw Errors.forbidden('Usuario sin empresa');
  return req.context.empresaId;
}

export async function listar(req: Request, res: Response) {
  const empresaId = requireEmpresa(req);
  const q = listarProveedoresQuery.parse(req.query);
  const proveedores = await service.listar(empresaId, q);
  res.json({ proveedores });
}

export async function obtener(req: Request, res: Response) {
  const empresaId = requireEmpresa(req);
  const { id } = proveedorIdParam.parse(req.params);
  const proveedor = await service.obtener(empresaId, id);
  res.json({ proveedor });
}

export async function crear(req: Request, res: Response) {
  const empresaId = requireEmpresa(req);
  const input = crearProveedorInput.parse(req.body);
  const proveedor = await service.crear(empresaId, input);
  res.status(201).json({ proveedor });
}

export async function actualizar(req: Request, res: Response) {
  const empresaId = requireEmpresa(req);
  const { id } = proveedorIdParam.parse(req.params);
  const input = actualizarProveedorInput.parse(req.body);
  const proveedor = await service.actualizar(empresaId, id, input);
  res.json({ proveedor });
}

export async function eliminar(req: Request, res: Response) {
  const empresaId = requireEmpresa(req);
  const { id } = proveedorIdParam.parse(req.params);
  await service.eliminar(empresaId, id);
  res.status(204).send();
}
