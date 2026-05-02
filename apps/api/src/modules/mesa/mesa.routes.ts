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

router.get('/', requireOperativo, asyncH(ctrl.listar));
router.patch('/:id/estado', requireOperativo, asyncH(ctrl.cambiarEstado));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
