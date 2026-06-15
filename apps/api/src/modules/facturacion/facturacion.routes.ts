import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './facturacion.controller.js';

/**
 * Rutas de facturación electrónica.
 *
 *  Configuración (admin de empresa):
 *    GET /facturacion/config
 *    PUT /facturacion/config
 *
 *  Documento por comprobante (montadas en comprobante.routes como sub-rutas):
 *    GET  /comprobantes/:id/fe/kude[?ticket=true]
 *    GET  /comprobantes/:id/fe/xml
 *    GET  /comprobantes/:id/fe/estado
 *    POST /comprobantes/:id/fe/reenviar
 */

const router = Router();
router.use(authRequired);

const requireAdmin = requireRol('ADMIN_EMPRESA');

router.get('/config', requireAdmin, asyncH(ctrl.obtenerConfig));
router.put('/config', requireAdmin, asyncH(ctrl.guardarConfig));

export default router;

/** Sub-router montado bajo /comprobantes/:id/fe. */
export const documentoRoutes = Router({ mergeParams: true });
documentoRoutes.use(authRequired);

const requireOperativo = requireRol('CAJERO', 'GERENTE_SUCURSAL', 'ADMIN_EMPRESA');
const requireGestion = requireRol('GERENTE_SUCURSAL', 'ADMIN_EMPRESA');

documentoRoutes.get('/kude', requireOperativo, asyncH(ctrl.kude));
documentoRoutes.get('/xml', requireOperativo, asyncH(ctrl.xml));
documentoRoutes.get('/estado', requireOperativo, asyncH(ctrl.estado));
documentoRoutes.post('/reenviar', requireGestion, asyncH(ctrl.reenviar));
documentoRoutes.post('/cancelar', requireGestion, asyncH(ctrl.cancelar));

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
