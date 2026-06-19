-- Métodos de pago: el cliente sólo opera EFECTIVO, TARJETA_CREDITO y TARJETA_DEBITO.
-- Revierte parcialmente 20260518170000 (que había consolidado las tarjetas en
-- BANCARD) y elimina DINELCO, TRANSFERENCIA y CHEQUE.
--
-- Remapeo de datos existentes (decisión del cliente):
--   BANCARD                          -> TARJETA_CREDITO
--   DINELCO / TRANSFERENCIA / CHEQUE -> EFECTIVO
--
-- Postgres no permite DROP VALUE en un enum, así que el patrón es:
--   1) crear enum nuevo con los 3 valores definitivos
--   2) reescribir columnas con CAST + remapeo de valores obsoletos
--   3) borrar enum viejo y renombrar el nuevo.

-- 1) Crear enum nuevo con los 3 valores definitivos.
CREATE TYPE "MetodoPago_new" AS ENUM ('EFECTIVO', 'TARJETA_CREDITO', 'TARJETA_DEBITO');

-- 2) Migrar columnas que usan el enum.
--    pago_comprobante.metodo
ALTER TABLE "pago_comprobante"
  ALTER COLUMN "metodo" TYPE "MetodoPago_new"
  USING (
    CASE
      WHEN "metodo"::text = 'BANCARD' THEN 'TARJETA_CREDITO'
      WHEN "metodo"::text IN ('DINELCO', 'TRANSFERENCIA', 'CHEQUE') THEN 'EFECTIVO'
      ELSE "metodo"::text
    END
  )::"MetodoPago_new";

--    movimiento_caja.metodo_pago (nullable)
ALTER TABLE "movimiento_caja"
  ALTER COLUMN "metodo_pago" TYPE "MetodoPago_new"
  USING (
    CASE
      WHEN "metodo_pago"::text = 'BANCARD' THEN 'TARJETA_CREDITO'
      WHEN "metodo_pago"::text IN ('DINELCO', 'TRANSFERENCIA', 'CHEQUE') THEN 'EFECTIVO'
      ELSE "metodo_pago"::text
    END
  )::"MetodoPago_new";

-- 3) Reemplazar el enum viejo por el nuevo.
DROP TYPE "MetodoPago";
ALTER TYPE "MetodoPago_new" RENAME TO "MetodoPago";
