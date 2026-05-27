-- AlterTable
ALTER TABLE "modificador_opcion" ADD COLUMN     "cantidad_inventario" DECIMAL(15,3),
ADD COLUMN     "producto_inventario_id" TEXT;

-- CreateIndex
CREATE INDEX "modificador_opcion_producto_inventario_id_idx" ON "modificador_opcion"("producto_inventario_id");

-- AddForeignKey
ALTER TABLE "modificador_opcion" ADD CONSTRAINT "modificador_opcion_producto_inventario_id_fkey" FOREIGN KEY ("producto_inventario_id") REFERENCES "producto_inventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
