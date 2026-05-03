-- CreateTable
CREATE TABLE "producto_imagen" (
    "producto_venta_id" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producto_imagen_pkey" PRIMARY KEY ("producto_venta_id")
);

-- AddForeignKey
ALTER TABLE "producto_imagen" ADD CONSTRAINT "producto_imagen_producto_venta_id_fkey" FOREIGN KEY ("producto_venta_id") REFERENCES "producto_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
