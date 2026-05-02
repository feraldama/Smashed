import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './mesa.controller.js';

const router = Router();
router.use(authRequired);

const requireOperativo = requireRol(
  'CAJERO',
  'MESERO',
  'COCINA',
  'GERENTE_SUCURSAL',
  'ADMIN_EMPRESA',
);

const requireAdmin = requireRol('ADMIN_EMPRESA', 'GERENTE_SUCURSAL');

// ───── Listado y operativo ─────
router.get('/', requireOperativo, asyncH(ctrl.listar));
router.patch('/:id/estado', requireOperativo, asyncH(ctrl.cambiarEstado));

// ───── CRUD Zonas ─────
router.post('/zonas', requireAdmin, asyncH(ctrl.crearZona));
router.patch('/zonas/:id', requireAdmin, asyncH(ctrl.actualizarZona));
router.delete('/zonas/:id', requireAdmin, asyncH(ctrl.eliminarZona));

// ───── CRUD Mesas ─────
router.post('/', requireAdmin, asyncH(ctrl.crearMesa));
router.patch('/:id', requireAdmin, asyncH(ctrl.actualizarMesa));
router.delete('/:id', requireAdmin, asyncH(ctrl.eliminarMesa));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
