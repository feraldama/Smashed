-- Snapshot del costo unitario al emitir el comprobante (guaraníes, enteros).
-- Se calcula expandiendo la receta del producto y multiplicando cada insumo
-- por su `producto_inventario.costo_unitario` vigente al facturar. Permite
-- calcular ganancia real: (precio_unitario - costo_unitario_snapshot) * cantidad.
-- Default 0 para registros previos a esta funcionalidad y productos sin receta.

-- AlterTable
ALTER TABLE "item_comprobante" ADD COLUMN "costo_unitario_snapshot" BIGINT NOT NULL DEFAULT 0;
