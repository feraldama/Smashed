-- CreateEnum
CREATE TYPE "TipoDescuento" AS ENUM ('PORCENTAJE', 'MONTO', 'CORTESIA');

-- AlterTable
ALTER TABLE "pedido" ADD COLUMN     "codigo_autorizacion_id" TEXT,
ADD COLUMN     "descuento_aplicado_por_id" TEXT,
ADD COLUMN     "descuento_autorizado_por_id" TEXT,
ADD COLUMN     "descuento_observacion" TEXT,
ADD COLUMN     "descuento_tipo" "TipoDescuento",
ADD COLUMN     "descuento_valor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "motivo_descuento_id" TEXT;

-- CreateTable
CREATE TABLE "motivo_descuento" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "requiere_autorizacion" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden_menu" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "motivo_descuento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "limite_descuento_rol" (
    "empresa_id" TEXT NOT NULL,
    "rol" "Rol" NOT NULL,
    "max_porcentaje" INTEGER NOT NULL DEFAULT 0,
    "puede_autorizar_otros" BOOLEAN NOT NULL DEFAULT false,
    "puede_usar_cortesia" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "limite_descuento_rol_pkey" PRIMARY KEY ("empresa_id","rol")
);

-- CreateTable
CREATE TABLE "codigo_autorizacion_descuento" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "max_porcentaje" INTEGER NOT NULL,
    "creado_por_id" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "usado_en" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigo_autorizacion_descuento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "motivo_descuento_empresa_id_activo_orden_menu_idx" ON "motivo_descuento"("empresa_id", "activo", "orden_menu");

-- CreateIndex
CREATE UNIQUE INDEX "motivo_descuento_empresa_id_nombre_key" ON "motivo_descuento"("empresa_id", "nombre");

-- CreateIndex
CREATE INDEX "codigo_autorizacion_descuento_empresa_id_expira_en_idx" ON "codigo_autorizacion_descuento"("empresa_id", "expira_en");

-- CreateIndex
CREATE INDEX "codigo_autorizacion_descuento_empresa_id_usado_en_idx" ON "codigo_autorizacion_descuento"("empresa_id", "usado_en");

-- CreateIndex
CREATE UNIQUE INDEX "codigo_autorizacion_descuento_empresa_id_codigo_key" ON "codigo_autorizacion_descuento"("empresa_id", "codigo");

-- AddForeignKey
ALTER TABLE "motivo_descuento" ADD CONSTRAINT "motivo_descuento_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "limite_descuento_rol" ADD CONSTRAINT "limite_descuento_rol_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_autorizacion_descuento" ADD CONSTRAINT "codigo_autorizacion_descuento_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_autorizacion_descuento" ADD CONSTRAINT "codigo_autorizacion_descuento_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_motivo_descuento_id_fkey" FOREIGN KEY ("motivo_descuento_id") REFERENCES "motivo_descuento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_descuento_aplicado_por_id_fkey" FOREIGN KEY ("descuento_aplicado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_descuento_autorizado_por_id_fkey" FOREIGN KEY ("descuento_autorizado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_codigo_autorizacion_id_fkey" FOREIGN KEY ("codigo_autorizacion_id") REFERENCES "codigo_autorizacion_descuento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
