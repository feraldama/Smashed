-- Padrón de cédulas (referencia global, NO multi-tenant).
-- Tabla de consulta CI -> nombre/apellido para autocompletar al cargar clientes.
-- Se puebla por COPY fuera de Prisma (carga masiva ~6,9M filas).
CREATE TABLE "padron_ci" (
    "ci" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,

    CONSTRAINT "padron_ci_pkey" PRIMARY KEY ("ci")
);
