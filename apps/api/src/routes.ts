import { Router } from 'express';

import authRoutes from './modules/auth/auth.routes.js';
import cajaRoutes from './modules/caja/caja.routes.js';
import catalogoRoutes from './modules/catalogo/catalogo.routes.js';
import clienteRoutes from './modules/cliente/cliente.routes.js';
import comprobanteRoutes from './modules/comprobante/comprobante.routes.js';
import inventarioRoutes from './modules/inventario/inventario.routes.js';
import mesaRoutes from './modules/mesa/mesa.routes.js';
import pedidoRoutes from './modules/pedido/pedido.routes.js';
import proveedorRoutes from './modules/proveedor/proveedor.routes.js';
import reportesRoutes from './modules/reportes/reportes.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/catalogo', catalogoRoutes);
router.use('/clientes', clienteRoutes);
router.use('/proveedores', proveedorRoutes);
router.use('/inventario', inventarioRoutes);
router.use('/mesas', mesaRoutes);
router.use('/pedidos', pedidoRoutes);
router.use('/comprobantes', comprobanteRoutes);
router.use('/reportes', reportesRoutes);
router.use('/', cajaRoutes); // expone /cajas y /cajas/aperturas/...

export default router;
