-- Cada opción del combo es una sub-tarea independiente para cocina/bar/parrilla.
-- Hereda sector del producto elegido y tiene estado propio para que cada sector
-- marque listo lo suyo sin pisarse. El ItemPedido pasa a LISTO cuando todas las
-- opciones están listas.

-- AlterTable
ALTER TABLE "item_pedido_combo_opcion"
  ADD COLUMN "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN "sector_comanda" "SectorComanda",
  ADD COLUMN "en_preparacion_en" TIMESTAMP(3),
  ADD COLUMN "listo_en" TIMESTAMP(3),
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: heredar sector del productoVenta de la opción elegida.
UPDATE "item_pedido_combo_opcion" ipco
SET "sector_comanda" = pv."sector_comanda"
FROM "combo_grupo_opcion" cgo
JOIN "producto_venta" pv ON pv."id" = cgo."producto_venta_id"
WHERE ipco."combo_grupo_opcion_id" = cgo."id";

-- Backfill: si el item_pedido ya está LISTO, marcar todas sus opciones como LISTO también.
UPDATE "item_pedido_combo_opcion" ipco
SET "estado" = 'LISTO', "listo_en" = ip."updated_at"
FROM "item_pedido" ip
WHERE ipco."item_pedido_id" = ip."id" AND ip."estado" = 'LISTO';

-- CreateIndex
CREATE INDEX "item_pedido_combo_opcion_sector_comanda_estado_idx"
  ON "item_pedido_combo_opcion"("sector_comanda", "estado");
