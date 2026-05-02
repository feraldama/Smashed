import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './modificador.controller.js';

const router = Router();
router.use(authRequired);

const requireAdmin = requireRol('ADMIN_EMPRESA', 'GERENTE_SUCURSAL');

// ───── Grupos ─────
router.get('/', requireAdmin, asyncH(ctrl.listar));
router.get('/:id', requireAdmin, asyncH(ctrl.obtener));
router.post('/', requireAdmin, asyncH(ctrl.crear));
router.patch('/:id', requireAdmin, asyncH(ctrl.actualizar));
router.delete('/:id', requireAdmin, asyncH(ctrl.eliminar));

// ───── Opciones (anidadas bajo grupo) ─────
router.post('/:id/opciones', requireAdmin, asyncH(ctrl.crearOpcion));
router.patch('/:id/opciones/:opcionId', requireAdmin, asyncH(ctrl.actualizarOpcion));
router.delete('/:id/opciones/:opcionId', requireAdmin, asyncH(ctrl.eliminarOpcion));

// ───── Vinculación con productos ─────
router.post('/:id/productos', requireAdmin, asyncH(ctrl.vincularProducto));
router.delete('/:id/productos/:productoId', requireAdmin, asyncH(ctrl.desvincularProducto));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
