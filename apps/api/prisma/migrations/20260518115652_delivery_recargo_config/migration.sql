-- CreateEnum
CREATE TYPE "TipoRecargoDelivery" AS ENUM ('PORCENTAJE', 'MONTO');

-- AlterTable
ALTER TABLE "cliente" ADD COLUMN     "sin_recargo_delivery" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "pedido" ADD COLUMN     "recargo_delivery" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sucursal" ADD COLUMN     "delivery_recargo_activo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "delivery_recargo_tipo" "TipoRecargoDelivery" NOT NULL DEFAULT 'MONTO',
ADD COLUMN     "delivery_recargo_valor" BIGINT NOT NULL DEFAULT 0;
