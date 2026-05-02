
import { Errors } from '../../lib/errors.js';

import {
  actualizarClienteInput,
  clienteIdParam,
  crearClienteInput,
  direccionIdParam,
  direccionInput,
  listarClientesQuery,
} from './cliente.schemas.js';
import * as service from './cliente.service.js';

import type { Request, Response } from 'express';

function requireEmpresa(req: Request) {
  if (!req.context) throw Errors.unauthorized();
  if (!req.context.empresaId) throw Errors.forbidden('Usuario sin empresa');
  return { ctx: req.context, empresaId: req.context.empresaId };
}

export async function listar(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const q = listarClientesQuery.parse(req.query);
  const clientes = await service.listarClientes(empresaId, q);
  res.json({ clientes });
}

export async function obtener(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id } = clienteIdParam.parse(req.params);
  const cliente = await service.obtenerCliente(empresaId, id);
  res.json({ cliente });
}

export async function crear(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const input = crearClienteInput.parse(req.body);
  const cliente = await service.crearCliente(empresaId, input);
  res.status(201).json({ cliente });
}

export async function actualizar(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id } = clienteIdParam.parse(req.params);
  const input = actualizarClienteInput.parse(req.body);
  const cliente = await service.actualizarCliente(empresaId, id, input);
  res.json({ cliente });
}

export async function eliminar(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id } = clienteIdParam.parse(req.params);
  await service.eliminarCliente(empresaId, id);
  res.status(204).send();
}

export async function agregarDireccion(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id } = clienteIdParam.parse(req.params);
  const input = direccionInput.parse(req.body);
  const dir = await service.agregarDireccion(empresaId, id, input);
  res.status(201).json({ direccion: dir });
}

export async function actualizarDireccion(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id, dirId } = direccionIdParam.parse(req.params);
  const input = direccionInput.parse(req.body);
  const dir = await service.actualizarDireccion(empresaId, id, dirId, input);
  res.json({ direccion: dir });
}

export async function eliminarDireccion(req: Request, res: Response) {
  const { empresaId } = requireEmpresa(req);
  const { id, dirId } = direccionIdParam.parse(req.params);
  await service.eliminarDireccion(empresaId, id, dirId);
  res.status(204).send();
}
