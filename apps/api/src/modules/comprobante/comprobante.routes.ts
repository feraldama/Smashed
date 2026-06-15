import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';
import { documentoRoutes } from '../facturacion/facturacion.routes.js';

import * as ctrl from './comprobante.controller.js';

const router = Router();
router.use(authRequired);

const requireOperativo = requireRol('CAJERO', 'GERENTE_SUCURSAL', 'ADMIN_EMPRESA');

router.get('/', asyncH(ctrl.listar));
router.get('/:id', asyncH(ctrl.detalle));
router.post('/', requireOperativo, asyncH(ctrl.emitir));
router.post('/:id/anular', requireOperativo, asyncH(ctrl.anular));

// Documento electrónico (CODE100): /comprobantes/:id/fe/{kude,xml,estado,reenviar,cancelar}
router.use('/:id/fe', documentoRoutes);

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
