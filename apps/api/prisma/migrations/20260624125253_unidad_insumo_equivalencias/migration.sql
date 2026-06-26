-- CreateTable
CREATE TABLE "unidad_insumo" (
    "id" TEXT NOT NULL,
    "producto_inventario_id" TEXT NOT NULL,
    "unidad" "UnidadMedida" NOT NULL,
    "cantidad_unidad" DECIMAL(18,6) NOT NULL,
    "cantidad_base" DECIMAL(18,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unidad_insumo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unidad_insumo_producto_inventario_id_idx" ON "unidad_insumo"("producto_inventario_id");

-- CreateIndex
CREATE UNIQUE INDEX "unidad_insumo_producto_inventario_id_unidad_key" ON "unidad_insumo"("producto_inventario_id", "unidad");

-- AddForeignKey
ALTER TABLE "unidad_insumo" ADD CONSTRAINT "unidad_insumo_producto_inventario_id_fkey" FOREIGN KEY ("producto_inventario_id") REFERENCES "producto_inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
