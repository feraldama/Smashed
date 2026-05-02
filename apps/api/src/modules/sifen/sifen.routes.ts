import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './sifen.controller.js';

/**
 * Rutas SIFEN — montadas como sub-rutas de /comprobantes/:id en routes.ts.
 *  POST /comprobantes/:id/sifen/enviar
 *  POST /comprobantes/:id/sifen/cancelar
 *  GET  /comprobantes/:id/sifen/estado
 */
const router = Router({ mergeParams: true });
router.use(authRequired);

const requireOperativo = requireRol('CAJERO', 'GERENTE_SUCURSAL', 'ADMIN_EMPRESA');

router.post('/enviar', requireOperativo, asyncH(ctrl.enviar));
router.post('/cancelar', requireOperativo, asyncH(ctrl.cancelar));
router.get('/estado', asyncH(ctrl.estado));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
