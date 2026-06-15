-- CreateEnum
CREATE TYPE "ProveedorFacturacion" AS ENUM ('CODE100');

-- CreateEnum
CREATE TYPE "AmbienteFacturacion" AS ENUM ('TEST', 'PROD');

-- CreateTable
CREATE TABLE "configuracion_facturacion" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "proveedor" "ProveedorFacturacion" NOT NULL DEFAULT 'CODE100',
    "ambiente" "AmbienteFacturacion" NOT NULL DEFAULT 'TEST',
    "code100_ruc" TEXT NOT NULL,
    "code100_password" TEXT NOT NULL,
    "code100_dominio" TEXT NOT NULL,
    "emisor_tipo_contribuyente" INTEGER NOT NULL DEFAULT 2,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_facturacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_facturacion_empresa_id_key" ON "configuracion_facturacion"("empresa_id");

-- AddForeignKey
ALTER TABLE "configuracion_facturacion" ADD CONSTRAINT "configuracion_facturacion_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
