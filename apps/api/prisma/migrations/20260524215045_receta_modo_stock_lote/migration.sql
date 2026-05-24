-- CreateEnum
CREATE TYPE "ModoStockReceta" AS ENUM ('CALCULADA', 'LOTE');

-- AlterTable
ALTER TABLE "receta" ADD COLUMN     "modo_stock" "ModoStockReceta" NOT NULL DEFAULT 'CALCULADA',
ADD COLUMN     "producto_inventario_id" TEXT;

-- CreateIndex
CREATE INDEX "receta_producto_inventario_id_idx" ON "receta"("producto_inventario_id");

-- AddForeignKey
ALTER TABLE "receta" ADD CONSTRAINT "receta_producto_inventario_id_fkey" FOREIGN KEY ("producto_inventario_id") REFERENCES "producto_inventario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
