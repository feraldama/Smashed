import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './cliente.controller.js';

const router = Router();
router.use(authRequired);

const requireOperativo = requireRol('CAJERO', 'MESERO', 'GERENTE_SUCURSAL', 'ADMIN_EMPRESA');
const requireAdmin = requireRol('ADMIN_EMPRESA', 'GERENTE_SUCURSAL');

// Listado y detalle: cualquier rol operativo puede consultar (para autocomplete del POS futuro)
router.get('/', requireOperativo, asyncH(ctrl.listar));
router.get('/:id', requireOperativo, asyncH(ctrl.obtener));

// Mutaciones: roles de gestión
router.post('/', requireOperativo, asyncH(ctrl.crear));
router.patch('/:id', requireOperativo, asyncH(ctrl.actualizar));
router.delete('/:id', requireAdmin, asyncH(ctrl.eliminar));

// Direcciones
router.post('/:id/direcciones', requireOperativo, asyncH(ctrl.agregarDireccion));
router.patch('/:id/direcciones/:dirId', requireOperativo, asyncH(ctrl.actualizarDireccion));
router.delete('/:id/direcciones/:dirId', requireOperativo, asyncH(ctrl.eliminarDireccion));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
