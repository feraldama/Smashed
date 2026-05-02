-- AlterTable
ALTER TABLE "sucursal" ADD COLUMN     "ultimo_numero_pedido" INTEGER NOT NULL DEFAULT 0;

-- Backfill desde pedidos existentes para no romper la numeración correlativa.
UPDATE "sucursal" s
SET "ultimo_numero_pedido" = COALESCE(
  (SELECT MAX(p."numero") FROM "pedido" p WHERE p."sucursal_id" = s."id"),
  0
);
