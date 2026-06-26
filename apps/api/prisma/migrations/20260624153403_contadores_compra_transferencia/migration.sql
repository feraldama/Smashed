-- AlterTable
ALTER TABLE "sucursal" ADD COLUMN     "ultimo_numero_compra" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ultimo_numero_transferencia" INTEGER NOT NULL DEFAULT 0;

-- Backfill: arrancar cada contador en el máximo número ya usado por sucursal,
-- para que la primera compra/transferencia posterior a esta migración no
-- colisione con datos existentes (la numeración es por sucursal / sucursal origen).
UPDATE "sucursal" s
SET "ultimo_numero_compra" = COALESCE(
  (SELECT MAX(c."numero") FROM "compra" c WHERE c."sucursal_id" = s."id"), 0);

UPDATE "sucursal" s
SET "ultimo_numero_transferencia" = COALESCE(
  (SELECT MAX(t."numero") FROM "transferencia_stock" t WHERE t."sucursal_origen_id" = s."id"), 0);
