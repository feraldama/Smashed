import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../../middleware/auth.js';

import * as ctrl from './admin-empresa.controller.js';

const router = Router();

// Todas las rutas de este módulo son SUPER_ADMIN-only.
router.use(authRequired);
router.use(requireRol('SUPER_ADMIN'));

router.post('/', asyncH(ctrl.crear));
router.get('/', asyncH(ctrl.listar));
// Rutas estáticas antes de las dinámicas para que `salir-modo-operar` no
// sea capturado por `:id`.
router.post('/salir-modo-operar', asyncH(ctrl.salirDeOperar));
router.get('/:id', asyncH(ctrl.obtener));
router.patch('/:id/activa', asyncH(ctrl.cambiarActiva));
router.post('/:id/operar', asyncH(ctrl.operarComo));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
