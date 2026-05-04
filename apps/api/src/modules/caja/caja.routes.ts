import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './caja.controller.js';

const router = Router();
router.use(authRequired);

const requireOperativo = requireRol('CAJERO', 'GERENTE_SUCURSAL', 'ADMIN_EMPRESA');
const requireAdmin = requireRol('ADMIN_EMPRESA', 'GERENTE_SUCURSAL');

// Listado y consultas
router.get('/cajas', asyncH(ctrl.listarCajas));
router.get('/cajas/aperturas/activa', asyncH(ctrl.aperturaActiva));
router.get('/cajas/aperturas/:aperturaId', asyncH(ctrl.obtenerApertura));
router.get('/cajas/cierres/:cierreId', asyncH(ctrl.obtenerCierre));

// CRUD admin (gestión de cajas físicas)
router.post('/cajas', requireAdmin, asyncH(ctrl.crearCaja));
router.patch('/cajas/:id', requireAdmin, asyncH(ctrl.actualizarCaja));
router.delete('/cajas/:id', requireAdmin, asyncH(ctrl.eliminarCaja));

// Operativas (apertura, cierre, movimientos)
router.post('/cajas/:cajaId/abrir', requireOperativo, asyncH(ctrl.abrirCaja));
router.post('/cajas/aperturas/:aperturaId/cerrar', requireOperativo, asyncH(ctrl.cerrarCaja));
router.post('/cajas/aperturas/:aperturaId/movimientos', requireOperativo, asyncH(ctrl.movimiento));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
