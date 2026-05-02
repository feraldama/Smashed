import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './empresa.controller.js';

const router = Router();
router.use(authRequired);

const requireGestion = requireRol('ADMIN_EMPRESA', 'SUPER_ADMIN');

// Cualquier rol autenticado puede ver su empresa (para mostrar logo, datos en facturas, etc.)
router.get('/mi-empresa', asyncH(ctrl.obtener));
router.patch('/mi-empresa', requireGestion, asyncH(ctrl.actualizar));
router.patch('/mi-empresa/configuracion', requireGestion, asyncH(ctrl.actualizarConfig));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
