import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';

import * as ctrl from './descuento.controller.js';

const router = Router();
router.use(authRequired);

const requireGestion = requireRol('ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN');

// ───── Aplicar / remover descuento sobre un pedido ─────
// El gate de quién puede aplicar lo hace el SERVICE (matriz de límites por
// rol, supervisor, código). Acá sólo exigimos auth.
router.post('/pedidos/:id/descuento', asyncH(ctrl.aplicar));
router.delete('/pedidos/:id/descuento', asyncH(ctrl.remover));

// ───── Verificar supervisor (pre-check de UI) ─────
router.post('/auth/verificar-supervisor', asyncH(ctrl.verificarSupervisor));

// ───── Empleados beneficiarios del descuento empleado (lectura para POS) ─────
router.get('/empleados-beneficiarios', asyncH(ctrl.listarEmpleadosBeneficiarios));

// ───── Motivos (cualquier rol auth lee; gestión escribe) ─────
router.get('/motivos', asyncH(ctrl.listarMotivos));
router.post('/motivos', requireGestion, asyncH(ctrl.crearMotivo));
router.patch('/motivos/:id', requireGestion, asyncH(ctrl.actualizarMotivo));
router.delete('/motivos/:id', requireGestion, asyncH(ctrl.eliminarMotivo));

// ───── Límites por rol (solo gestión) ─────
router.get('/limites', requireGestion, asyncH(ctrl.obtenerLimites));
router.patch('/limites', requireGestion, asyncH(ctrl.actualizarLimites));

// ───── Códigos (cualquiera con puedeAutorizarOtros crea; gestión elimina) ─────
router.get('/codigos', requireGestion, asyncH(ctrl.listarCodigos));
router.post('/codigos', asyncH(ctrl.crearCodigo)); // service valida puedeAutorizarOtros
router.delete('/codigos/:id', requireGestion, asyncH(ctrl.eliminarCodigo));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
