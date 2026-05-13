import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './reportes.controller.js';

const router = Router();
router.use(authRequired);

const requireGestion = requireRol('ADMIN_EMPRESA', 'GERENTE_SUCURSAL');

router.get('/dashboard', requireGestion, asyncH(ctrl.dashboard));

router.get('/ventas/resumen', requireGestion, asyncH(ctrl.resumenVentas));
router.get('/ventas/por-dia', requireGestion, asyncH(ctrl.ventasPorDia));
router.get('/ventas/por-hora', requireGestion, asyncH(ctrl.ventasPorHora));
router.get('/ventas/metodos-pago', requireGestion, asyncH(ctrl.metodosPago));

router.get('/productos/top', requireGestion, asyncH(ctrl.topProductos));
router.get('/productos/rentabilidad', requireGestion, asyncH(ctrl.productosRentabilidad));
router.get('/clientes/top', requireGestion, asyncH(ctrl.topClientes));

router.get('/sucursales/comparativa', requireGestion, asyncH(ctrl.comparativaSucursales));

router.get('/inventario/stock-bajo', requireGestion, asyncH(ctrl.stockBajo));
router.get('/inventario/valuacion', requireGestion, asyncH(ctrl.valuacionInventario));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
