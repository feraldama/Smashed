-- AlterTable
ALTER TABLE "motivo_descuento" ADD COLUMN     "codigo_sistema" TEXT,
ADD COLUMN     "es_sistema" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "configuracion_empresa" ADD COLUMN     "porcentaje_descuento_empleado" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "es_empleado_con_descuento" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "pedido" ADD COLUMN     "empleado_beneficiario_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "motivo_descuento_empresa_id_codigo_sistema_key" ON "motivo_descuento"("empresa_id", "codigo_sistema");

-- CreateIndex
CREATE INDEX "pedido_empleado_beneficiario_id_created_at_idx" ON "pedido"("empleado_beneficiario_id", "created_at");

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_empleado_beneficiario_id_fkey" FOREIGN KEY ("empleado_beneficiario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data migration: crear motivo "Descuento empleado" para cada empresa existente.
-- El motivo se identifica por codigo_sistema='DESCUENTO_EMPLEADO' (estable, no
-- depende del nombre que el usuario podría querer renombrar a futuro). Marcado
-- como es_sistema=true para que la UI lo proteja contra borrado/edición.
-- requiere_autorizacion=false: el cajero puede aplicarlo sin escalado.
INSERT INTO "motivo_descuento" (
  "id", "empresa_id", "nombre", "requiere_autorizacion", "activo",
  "orden_menu", "es_sistema", "codigo_sistema", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  e."id",
  'Descuento empleado',
  false,
  true,
  0,
  true,
  'DESCUENTO_EMPLEADO',
  NOW(),
  NOW()
FROM "empresa" e
WHERE NOT EXISTS (
  SELECT 1 FROM "motivo_descuento" m
  WHERE m."empresa_id" = e."id"
    AND m."codigo_sistema" = 'DESCUENTO_EMPLEADO'
);
