-- AlterTable
ALTER TABLE "producto_venta" ADD COLUMN     "cantidad_inventario" DECIMAL(15,3) DEFAULT 1,
ADD COLUMN     "producto_inventario_id" TEXT;

-- CreateIndex
CREATE INDEX "producto_venta_producto_inventario_id_idx" ON "producto_venta"("producto_inventario_id");

-- AddForeignKey
ALTER TABLE "producto_venta" ADD CONSTRAINT "producto_venta_producto_inventario_id_fkey" FOREIGN KEY ("producto_inventario_id") REFERENCES "producto_inventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
