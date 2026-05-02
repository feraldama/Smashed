import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './sucursal.controller.js';

const router = Router();
router.use(authRequired);

const requireGestion = requireRol('ADMIN_EMPRESA', 'SUPER_ADMIN');

// Listar es público para cualquier rol auteneticado (los selectores lo necesitan)
router.get('/', asyncH(ctrl.listar));
router.get('/:id', asyncH(ctrl.detalle));
router.post('/', requireGestion, asyncH(ctrl.crear));
router.patch('/:id', requireGestion, asyncH(ctrl.actualizar));
router.delete('/:id', requireGestion, asyncH(ctrl.eliminar));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
