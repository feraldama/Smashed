import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './menuRol.controller.js';

const router = Router();
router.use(authRequired);

// Solo gestión empresarial puede ver/editar la matriz (no gerente sucursal).
const requireGestion = requireRol('ADMIN_EMPRESA');

router.get('/', requireGestion, asyncH(ctrl.obtenerMatriz));
router.put('/', requireGestion, asyncH(ctrl.actualizarMatriz));
router.post('/reset', requireGestion, asyncH(ctrl.resetearMatriz));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
