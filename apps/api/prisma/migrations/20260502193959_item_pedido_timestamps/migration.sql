-- Timestamps de transición para ItemPedido (analytics + cronómetro KDS por línea).
ALTER TABLE "item_pedido"
  ADD COLUMN "en_preparacion_en" TIMESTAMP(3),
  ADD COLUMN "listo_en" TIMESTAMP(3);

-- Backfill: si un item ya está LISTO, usar su updated_at como aproximación de listo_en.
UPDATE "item_pedido" SET "listo_en" = "updated_at" WHERE "estado" = 'LISTO';
