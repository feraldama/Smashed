-- Simplificación de métodos de pago.
-- El sistema sólo acepta 5 métodos: EFECTIVO, BANCARD, DINELCO, TRANSFERENCIA, CHEQUE.
-- INFONET pasa a llamarse DINELCO (otra red).
-- TARJETA_DEBITO y TARJETA_CREDITO se consolidan en BANCARD (todas las tarjetas pasan por bancard).
-- ZIMPLE, TIGO_MONEY y PERSONAL_PAY se consolidan en EFECTIVO (billeteras móviles que en práctica equivalen a cash).
--
-- Postgres no permite DROP VALUE en un enum, así que el patrón es:
--   1) renombrar INFONET → DINELCO (in-place)
--   2) crear enum nuevo con los 5 valores
--   3) reescribir columnas con CAST + remapeo de valores obsoletos
--   4) borrar enum viejo y renombrar el nuevo.

-- 1) Rename INFONET → DINELCO en el enum existente.
ALTER TYPE "MetodoPago" RENAME VALUE 'INFONET' TO 'DINELCO';

-- 2) Crear enum nuevo con los 5 valores definitivos.
CREATE TYPE "MetodoPago_new" AS ENUM ('EFECTIVO', 'BANCARD', 'DINELCO', 'TRANSFERENCIA', 'CHEQUE');

-- 3) Migrar columnas que usan el enum.
--    pago_comprobante.metodo
ALTER TABLE "pago_comprobante"
  ALTER COLUMN "metodo" TYPE "MetodoPago_new"
  USING (
    CASE
      WHEN "metodo"::text IN ('TARJETA_DEBITO', 'TARJETA_CREDITO') THEN 'BANCARD'
      WHEN "metodo"::text IN ('ZIMPLE', 'TIGO_MONEY', 'PERSONAL_PAY') THEN 'EFECTIVO'
      ELSE "metodo"::text
    END
  )::"MetodoPago_new";

--    movimiento_caja.metodo_pago (nullable)
ALTER TABLE "movimiento_caja"
  ALTER COLUMN "metodo_pago" TYPE "MetodoPago_new"
  USING (
    CASE
      WHEN "metodo_pago"::text IN ('TARJETA_DEBITO', 'TARJETA_CREDITO') THEN 'BANCARD'
      WHEN "metodo_pago"::text IN ('ZIMPLE', 'TIGO_MONEY', 'PERSONAL_PAY') THEN 'EFECTIVO'
      ELSE "metodo_pago"::text
    END
  )::"MetodoPago_new";

-- 4) Reemplazar el enum viejo por el nuevo.
DROP TYPE "MetodoPago";
ALTER TYPE "MetodoPago_new" RENAME TO "MetodoPago";
