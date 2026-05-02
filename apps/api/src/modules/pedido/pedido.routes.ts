import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './pedido.controller.js';

const router = Router();
router.use(authRequired);

const requireOperativo = requireRol('CAJERO', 'MESERO', 'GERENTE_SUCURSAL', 'ADMIN_EMPRESA');
const requireKitchen = requireRol(
  'COCINA',
  'CAJERO',
  'MESERO',
  'GERENTE_SUCURSAL',
  'ADMIN_EMPRESA',
);

router.get('/kds', requireKitchen, asyncH(ctrl.listarKds));
router.get('/', asyncH(ctrl.listar));
router.get('/:id', asyncH(ctrl.detalle));
router.post('/', requireOperativo, asyncH(ctrl.crear));
router.post('/:id/confirmar', requireOperativo, asyncH(ctrl.confirmar));
router.post('/:id/items', requireOperativo, asyncH(ctrl.agregarItems));
router.patch('/:id/estado', requireKitchen, asyncH(ctrl.transicionar));
router.patch('/:id/items/:itemId/estado', requireKitchen, asyncH(ctrl.cambiarEstadoItem));
router.post('/:id/cancelar', requireOperativo, asyncH(ctrl.cancelar));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
