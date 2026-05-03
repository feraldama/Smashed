-- DropIndex
DROP INDEX "item_pedido_modificador_item_pedido_id_modificador_opcion_i_key";

-- AlterTable
ALTER TABLE "item_pedido_modificador" ADD COLUMN "combo_grupo_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "item_pedido_modificador_item_pedido_id_modificador_opcion__key" ON "item_pedido_modificador"("item_pedido_id", "modificador_opcion_id", "combo_grupo_id");

-- CreateIndex
CREATE INDEX "item_pedido_modificador_combo_grupo_id_idx" ON "item_pedido_modificador"("combo_grupo_id");

-- AddForeignKey
ALTER TABLE "item_pedido_modificador" ADD CONSTRAINT "item_pedido_modificador_combo_grupo_id_fkey" FOREIGN KEY ("combo_grupo_id") REFERENCES "combo_grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
