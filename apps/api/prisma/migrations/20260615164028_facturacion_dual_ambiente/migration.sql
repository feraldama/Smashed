/*
  Warnings:

  - You are about to drop the column `ambiente` on the `configuracion_facturacion` table. All the data in the column will be lost.
  - You are about to drop the column `code100_dominio` on the `configuracion_facturacion` table. All the data in the column will be lost.
  - You are about to drop the column `code100_password` on the `configuracion_facturacion` table. All the data in the column will be lost.
  - You are about to drop the column `code100_ruc` on the `configuracion_facturacion` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "configuracion_facturacion" DROP COLUMN "ambiente",
DROP COLUMN "code100_dominio",
DROP COLUMN "code100_password",
DROP COLUMN "code100_ruc",
ADD COLUMN     "ambiente_activo" "AmbienteFacturacion" NOT NULL DEFAULT 'TEST',
ADD COLUMN     "prod_dominio" TEXT,
ADD COLUMN     "prod_password" TEXT,
ADD COLUMN     "prod_ruc" TEXT,
ADD COLUMN     "test_dominio" TEXT,
ADD COLUMN     "test_password" TEXT,
ADD COLUMN     "test_ruc" TEXT;
