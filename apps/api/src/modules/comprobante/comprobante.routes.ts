import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';
import sifenRoutes from '../sifen/sifen.routes.js';

import * as ctrl from './comprobante.controller.js';

const router = Router();
router.use(authRequired);

const requireOperativo = requireRol('CAJERO', 'GERENTE_SUCURSAL', 'ADMIN_EMPRESA');

router.get('/', asyncH(ctrl.listar));
router.get('/:id', asyncH(ctrl.detalle));
router.post('/', requireOperativo, asyncH(ctrl.emitir));
router.post('/:id/anular', requireOperativo, asyncH(ctrl.anular));

// Sub-rutas SIFEN: /comprobantes/:id/sifen/{enviar,cancelar,estado}
router.use('/:id/sifen', sifenRoutes);

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
