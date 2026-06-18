-- ═══════════════════════════════════════════════════════════════════════════
--  Reset de arranque en PRODUCCIÓN — Smash POS
--
--  Limpia los datos transaccionales/operativos generados durante pruebas y
--  capacitación, y resetea contadores/estado, dejando intacto el maestro real
--  (empresa, sucursales, usuarios, catálogo, recetas, combos, modificadores,
--  promociones, clientes, stock_sucursal, timbrados).
--
--  Decisiones de arranque (acordadas con el negocio):
--   - stock_sucursal: SE CONSERVA (el saldo cargado es el inventario real).
--   - cliente / direccion_cliente: SE CONSERVAN (base real).
--   - timbrado: reales — se resetea el correlativo a rango_desde - 1 para que la
--     primera factura real salga con el número autorizado.
--
--  ⚠️ DESTRUCTIVO E IRREVERSIBLE. Hacer pg_dump antes. Correr con la app frenada.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Truncar transaccional. CASCADE cubre las dependencias internas del set.
--    NO incluye cliente, direccion_cliente ni stock_sucursal (se conservan).
TRUNCATE TABLE
  pedido,
  item_pedido,
  item_pedido_modificador,
  item_pedido_combo_opcion,
  comprobante,
  item_comprobante,
  pago_comprobante,
  evento_sifen,
  apertura_caja,
  cierre_caja,
  movimiento_caja,
  movimiento_stock,
  transferencia_stock,
  item_transferencia,
  compra,
  item_compra,
  pedidos_ya_pedido,
  pedidos_ya_log,
  audit_log,
  codigo_autorizacion_descuento,
  refresh_token
RESTART IDENTITY CASCADE;

-- 2) Resetear contadores y estado a valores de arranque.
UPDATE sucursal SET ultimo_numero_pedido = 0;
UPDATE timbrado SET ultimo_numero_usado = rango_desde - 1;
UPDATE mesa SET estado = 'LIBRE';
UPDATE caja SET estado = 'CERRADA';

COMMIT;
