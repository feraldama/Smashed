-- AlterTable
ALTER TABLE "modificador_opcion" ADD COLUMN     "producto_venta_id" TEXT;

-- CreateIndex
CREATE INDEX "modificador_opcion_producto_venta_id_idx" ON "modificador_opcion"("producto_venta_id");

-- AddForeignKey
ALTER TABLE "modificador_opcion" ADD CONSTRAINT "modificador_opcion_producto_venta_id_fkey" FOREIGN KEY ("producto_venta_id") REFERENCES "producto_venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
