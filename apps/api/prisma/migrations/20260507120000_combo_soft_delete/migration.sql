-- Soft delete en árbol de combos para permitir editar combos ya usados en
-- pedidos sin romper la integridad referencial (ItemPedidoComboOpcion tiene
-- FK Restrict a combo_grupo y combo_grupo_opcion). Las lecturas filtran
-- deleted_at IS NULL; los pedidos históricos siguen resolviendo el grupo /
-- opción aunque esté soft-deleted (la FK no filtra).

-- AlterTable
ALTER TABLE "combo" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "combo_grupo" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "combo_grupo_opcion" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "combo_deleted_at_idx" ON "combo"("deleted_at");

-- CreateIndex
CREATE INDEX "combo_grupo_deleted_at_idx" ON "combo_grupo"("deleted_at");

-- CreateIndex
CREATE INDEX "combo_grupo_opcion_deleted_at_idx" ON "combo_grupo_opcion"("deleted_at");
