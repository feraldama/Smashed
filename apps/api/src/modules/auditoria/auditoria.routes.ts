import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './auditoria.controller.js';

const router = Router();
router.use(authRequired);

// Auditoría es información sensible (acciones de toda la empresa) → solo gestión.
// SUPER_ADMIN queda habilitado automáticamente por requireRol.
router.get('/', requireRol('ADMIN_EMPRESA'), asyncH(ctrl.listar));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
