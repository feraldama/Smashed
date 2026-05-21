-- CreateEnum
CREATE TYPE "TipoPromocion" AS ENUM ('PRECIO_FIJO', 'PORCENTAJE', 'NXM', 'COMBO');

-- AlterTable
ALTER TABLE "item_pedido" ADD COLUMN     "descuento_promocion" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "promocion_id" TEXT;

-- CreateTable
CREATE TABLE "promocion" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "TipoPromocion" NOT NULL,
    "precio_fijo" BIGINT,
    "porcentaje" INTEGER,
    "nxm_lleva" INTEGER,
    "nxm_paga" INTEGER,
    "vigencia_desde" TIMESTAMP(3),
    "vigencia_hasta" TIMESTAMP(3),
    "dias_semana" INTEGER[],
    "hora_inicio" VARCHAR(5),
    "hora_fin" VARCHAR(5),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "icono_emoji" VARCHAR(8),
    "orden_menu" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "promocion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promocion_producto" (
    "promocion_id" TEXT NOT NULL,
    "producto_venta_id" TEXT NOT NULL,
    "cantidad_min" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "promocion_producto_pkey" PRIMARY KEY ("promocion_id","producto_venta_id")
);

-- CreateTable
CREATE TABLE "promocion_sucursal" (
    "promocion_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,

    CONSTRAINT "promocion_sucursal_pkey" PRIMARY KEY ("promocion_id","sucursal_id")
);

-- CreateIndex
CREATE INDEX "promocion_empresa_id_activo_deleted_at_idx" ON "promocion"("empresa_id", "activo", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "promocion_empresa_id_nombre_key" ON "promocion"("empresa_id", "nombre");

-- CreateIndex
CREATE INDEX "promocion_producto_producto_venta_id_idx" ON "promocion_producto"("producto_venta_id");

-- CreateIndex
CREATE INDEX "promocion_sucursal_sucursal_id_idx" ON "promocion_sucursal"("sucursal_id");

-- CreateIndex
CREATE INDEX "item_pedido_promocion_id_idx" ON "item_pedido"("promocion_id");

-- AddForeignKey
ALTER TABLE "promocion" ADD CONSTRAINT "promocion_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promocion_producto" ADD CONSTRAINT "promocion_producto_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "promocion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promocion_producto" ADD CONSTRAINT "promocion_producto_producto_venta_id_fkey" FOREIGN KEY ("producto_venta_id") REFERENCES "producto_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promocion_sucursal" ADD CONSTRAINT "promocion_sucursal_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "promocion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promocion_sucursal" ADD CONSTRAINT "promocion_sucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido" ADD CONSTRAINT "item_pedido_promocion_id_fkey" FOREIGN KEY ("promocion_id") REFERENCES "promocion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
