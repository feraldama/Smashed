-- AlterTable
ALTER TABLE "sucursal" ADD COLUMN     "es_deposito" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "establecimiento" DROP NOT NULL;
