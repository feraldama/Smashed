import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './usuario.controller.js';

const router = Router();
router.use(authRequired);

const requireGestion = requireRol('ADMIN_EMPRESA', 'SUPER_ADMIN');

router.get('/', requireGestion, asyncH(ctrl.listar));
router.get('/:id', requireGestion, asyncH(ctrl.detalle));
router.post('/', requireGestion, asyncH(ctrl.crear));
router.patch('/:id', requireGestion, asyncH(ctrl.actualizar));
router.post('/:id/reset-password', requireGestion, asyncH(ctrl.resetPassword));
router.delete('/:id', requireGestion, asyncH(ctrl.eliminar));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
