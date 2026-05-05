import { Router } from 'express';

import adminEmpresaRoutes from './modules/admin/empresa/admin-empresa.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import cajaRoutes from './modules/caja/caja.routes.js';
import catalogoRoutes from './modules/catalogo/catalogo.routes.js';
import clienteRoutes from './modules/cliente/cliente.routes.js';
import compraRoutes from './modules/compra/compra.routes.js';
import comprobanteRoutes from './modules/comprobante/comprobante.routes.js';
import empresaRoutes from './modules/empresa/empresa.routes.js';
import inventarioRoutes from './modules/inventario/inventario.routes.js';
import menuRolRoutes from './modules/menuRol/menuRol.routes.js';
import mesaRoutes from './modules/mesa/mesa.routes.js';
import modificadorRoutes from './modules/modificador/modificador.routes.js';
import pedidoRoutes from './modules/pedido/pedido.routes.js';
import proveedorRoutes from './modules/proveedor/proveedor.routes.js';
import reportesRoutes from './modules/reportes/reportes.routes.js';
import sucursalRoutes from './modules/sucursal/sucursal.routes.js';
import transferenciaRoutes from './modules/transferencia/transferencia.routes.js';
import usuarioRoutes from './modules/usuario/usuario.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/admin/empresas', adminEmpresaRoutes);
router.use('/usuarios', usuarioRoutes);
router.use('/sucursales', sucursalRoutes);
router.use('/empresa', empresaRoutes);
router.use('/catalogo', catalogoRoutes);
router.use('/clientes', clienteRoutes);
router.use('/proveedores', proveedorRoutes);
router.use('/inventario', inventarioRoutes);
router.use('/compras', compraRoutes);
router.use('/transferencias', transferenciaRoutes);
router.use('/mesas', mesaRoutes);
router.use('/menu-rol', menuRolRoutes);
router.use('/modificadores', modificadorRoutes);
router.use('/pedidos', pedidoRoutes);
router.use('/comprobantes', comprobanteRoutes);
router.use('/reportes', reportesRoutes);
router.use('/', cajaRoutes); // expone /cajas y /cajas/aperturas/...

export default router;
