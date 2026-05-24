import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './subpreparacion.controller.js';

const router = Router();
router.use(authRequired);

// Listar y cambiar modo: admin / gerente. Producir lote también: el dueño de
// la cocina debería poder marcar la producción del día.
const requireAdmin = requireRol('ADMIN_EMPRESA', 'GERENTE_SUCURSAL');

router.get('/', requireAdmin, asyncH(ctrl.listar));
router.patch('/:id/modo-stock', requireAdmin, asyncH(ctrl.cambiarModoStock));
router.post('/:id/producir', requireAdmin, asyncH(ctrl.producirLote));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
