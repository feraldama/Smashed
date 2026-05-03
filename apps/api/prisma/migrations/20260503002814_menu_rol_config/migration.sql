-- AlterTable
ALTER TABLE "item_pedido_combo_opcion" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "menu_rol" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "menu" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_rol_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_rol_empresa_id_rol_idx" ON "menu_rol"("empresa_id", "rol");

-- CreateIndex
CREATE UNIQUE INDEX "menu_rol_empresa_id_menu_rol_key" ON "menu_rol"("empresa_id", "menu", "rol");

-- AddForeignKey
ALTER TABLE "menu_rol" ADD CONSTRAINT "menu_rol_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
