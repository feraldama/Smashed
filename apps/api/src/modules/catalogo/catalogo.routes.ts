import { type NextFunction, type Request, type Response, Router } from 'express';

import { authRequired, requireRol } from '../../middleware/auth.js';
import { uploadImagen } from '../../middleware/upload.js';

import * as ctrl from './catalogo.controller.js';

const router = Router();

// ───── PÚBLICO (sin auth) — sólo bytes de imagen, para <img src> directos ─────
router.get('/productos/:id/imagen', asyncH(ctrl.obtenerImagenProducto));

router.use(authRequired);

const requireAdmin = requireRol('ADMIN_EMPRESA', 'GERENTE_SUCURSAL');

// ───── READ (cualquier rol autenticado) ─────
router.get('/categorias', asyncH(ctrl.listarCategorias));
router.get('/productos', asyncH(ctrl.listarProductos));
router.get('/productos/:id', asyncH(ctrl.obtenerProducto));

// ───── WRITE (sólo gestión) ─────
router.post('/categorias', requireAdmin, asyncH(ctrl.crearCategoria));
router.patch('/categorias/:id', requireAdmin, asyncH(ctrl.actualizarCategoria));
router.delete('/categorias/:id', requireAdmin, asyncH(ctrl.eliminarCategoria));

router.post('/productos', requireAdmin, asyncH(ctrl.crearProducto));
router.patch('/productos/:id', requireAdmin, asyncH(ctrl.actualizarProducto));
router.delete('/productos/:id', requireAdmin, asyncH(ctrl.eliminarProducto));
router.post('/productos/:id/imagen', requireAdmin, uploadImagen, asyncH(ctrl.subirImagenProducto));
router.delete('/productos/:id/imagen', requireAdmin, asyncH(ctrl.eliminarImagenProducto));
router.post('/productos/:id/precio-sucursal', requireAdmin, asyncH(ctrl.setPrecioSucursal));
router.put('/productos/:id/receta', requireAdmin, asyncH(ctrl.setReceta));
router.delete('/productos/:id/receta', requireAdmin, asyncH(ctrl.eliminarReceta));
router.put('/productos/:id/combo', requireAdmin, asyncH(ctrl.setCombo));
router.delete('/productos/:id/combo', requireAdmin, asyncH(ctrl.eliminarCombo));

export default router;

function asyncH<T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
