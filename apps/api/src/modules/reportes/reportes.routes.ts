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
router.get('/ventas/por-canal', requireGestion, asyncH(ctrl.ventasPorCanal));
router.get('/ventas/metodos-pago', requireGestion, asyncH(ctrl.metodosPago));
router.get('/ventas/descuentos', requireGestion, asyncH(ctrl.descuentosListado));
router.get('/ventas/descuentos-por-empleado', requireGestion, asyncH(ctrl.descuentosPorEmpleado));
router.get('/ventas/promociones', requireGestion, asyncH(ctrl.promocionesAhorro));

router.get('/combos/opciones', requireGestion, asyncH(ctrl.combosOpciones));
router.get('/combos/combinaciones', requireGestion, asyncH(ctrl.combosCombinaciones));

router.get('/cocina/tiempos', requireGestion, asyncH(ctrl.tiemposCocina));

router.get('/caja/turnos', requireGestion, asyncH(ctrl.cajaTurnos));

router.get('/productos/top', requireGestion, asyncH(ctrl.topProductos));
router.get('/productos/rentabilidad', requireGestion, asyncH(ctrl.productosRentabilidad));
router.get('/clientes/top', requireGestion, asyncH(ctrl.topClientes));

router.get('/sucursales/comparativa', requireGestion, asyncH(ctrl.comparativaSucursales));

router.get('/inventario/stock-bajo', requireGestion, asyncH(ctrl.stockBajo));
router.get('/inventario/valuacion', requireGestion, asyncH(ctrl.valuacionInventario));
router.get('/inventario/movimientos', requireGestion, asyncH(ctrl.movimientosStock));
router.get('/inventario/movimientos-resumen', requireGestion, asyncH(ctrl.movimientosResumen));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
