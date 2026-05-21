import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './promocion.controller.js';

const router = Router();
router.use(authRequired);

const requireGestion = requireRol('ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN');

// Lectura: cualquier usuario auth de la empresa (POS necesita /vigentes y el
// admin necesita el listado completo).
router.get('/', requireGestion, asyncH(ctrl.listar));
router.get('/vigentes', asyncH(ctrl.listarVigentes));
router.get('/:id', requireGestion, asyncH(ctrl.obtener));

// Escritura: solo gestión.
router.post('/', requireGestion, asyncH(ctrl.crear));
router.patch('/:id', requireGestion, asyncH(ctrl.actualizar));
router.delete('/:id', requireGestion, asyncH(ctrl.eliminar));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
