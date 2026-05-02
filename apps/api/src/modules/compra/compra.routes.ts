import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './compra.controller.js';

const router = Router();
router.use(authRequired);

const requireAdmin = requireRol('ADMIN_EMPRESA', 'GERENTE_SUCURSAL');

router.get('/', requireAdmin, asyncH(ctrl.listar));
router.get('/:id', requireAdmin, asyncH(ctrl.obtener));
router.post('/', requireAdmin, asyncH(ctrl.crear));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
