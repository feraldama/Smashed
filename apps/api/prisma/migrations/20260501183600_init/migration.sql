-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('SUPER_ADMIN', 'ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'CAJERO', 'COCINA', 'MESERO', 'REPARTIDOR');

-- CreateEnum
CREATE TYPE "TipoContribuyente" AS ENUM ('PERSONA_FISICA', 'PERSONA_JURIDICA', 'EXTRANJERO', 'CONSUMIDOR_FINAL');

-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('UNIDAD', 'KILOGRAMO', 'GRAMO', 'LITRO', 'MILILITRO', 'PORCION', 'DOCENA');

-- CreateEnum
CREATE TYPE "TasaIva" AS ENUM ('IVA_10', 'IVA_5', 'IVA_0', 'EXENTO');

-- CreateEnum
CREATE TYPE "CategoriaProducto" AS ENUM ('HAMBURGUESA', 'LOMITO', 'PIZZA', 'EMPANADA', 'MILANESA', 'CHIPA', 'ENTRADA', 'ACOMPANAMIENTO', 'POSTRE', 'BEBIDA_FRIA', 'BEBIDA_CALIENTE', 'CERVEZA', 'COMBO', 'OTRO');

-- CreateEnum
CREATE TYPE "SectorComanda" AS ENUM ('COCINA_CALIENTE', 'COCINA_FRIA', 'PARRILLA', 'BAR', 'CAFETERIA', 'POSTRES');

-- CreateEnum
CREATE TYPE "TipoMovimientoStock" AS ENUM ('ENTRADA_COMPRA', 'ENTRADA_TRANSFERENCIA', 'ENTRADA_AJUSTE', 'ENTRADA_PRODUCCION', 'SALIDA_VENTA', 'SALIDA_TRANSFERENCIA', 'SALIDA_MERMA', 'SALIDA_AJUSTE', 'SALIDA_CONSUMO_INTERNO');

-- CreateEnum
CREATE TYPE "EstadoTransferencia" AS ENUM ('PENDIENTE', 'APROBADA', 'EN_TRANSITO', 'RECIBIDA', 'RECHAZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoPedido" AS ENUM ('MOSTRADOR', 'MESA', 'DELIVERY_PROPIO', 'DELIVERY_PEDIDOSYA', 'RETIRO_LOCAL');

-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO', 'ENTREGADO', 'FACTURADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoModificadorGrupo" AS ENUM ('UNICA', 'MULTIPLE');

-- CreateEnum
CREATE TYPE "EstadoMesa" AS ENUM ('LIBRE', 'OCUPADA', 'RESERVADA', 'PRECUENTA', 'LIMPIEZA', 'FUERA_DE_SERVICIO');

-- CreateEnum
CREATE TYPE "TipoDocumentoFiscal" AS ENUM ('TICKET', 'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'AUTOFACTURA', 'NOTA_REMISION');

-- CreateEnum
CREATE TYPE "CondicionVenta" AS ENUM ('CONTADO', 'CREDITO');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('EMITIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoSifen" AS ENUM ('NO_ENVIADO', 'PENDIENTE', 'APROBADO', 'RECHAZADO', 'CANCELADO', 'INUTILIZADO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA', 'CHEQUE', 'BANCARD', 'INFONET', 'ZIMPLE', 'TIGO_MONEY', 'PERSONAL_PAY');

-- CreateEnum
CREATE TYPE "EstadoCaja" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoMovimientoCaja" AS ENUM ('APERTURA', 'VENTA', 'COBRANZA', 'INGRESO_EXTRA', 'EGRESO', 'RETIRO_PARCIAL', 'CIERRE');

-- CreateEnum
CREATE TYPE "AccionAuditable" AS ENUM ('LOGIN', 'LOGOUT', 'LOGIN_FALLIDO', 'CREAR', 'ACTUALIZAR', 'ELIMINAR', 'ANULAR_COMPROBANTE', 'AJUSTAR_STOCK', 'TRANSFERENCIA_STOCK', 'CAMBIO_PRECIO', 'APERTURA_CAJA', 'CIERRE_CAJA', 'CAMBIO_PERMISO');

-- CreateEnum
CREATE TYPE "EstadoPedidosYa" AS ENUM ('RECIBIDO', 'ACEPTADO', 'RECHAZADO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "empresa" (
    "id" TEXT NOT NULL,
    "nombre_fantasia" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "dv" CHAR(1) NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "logo_url" TEXT,
    "color_primario" TEXT,
    "color_secundario" TEXT,
    "zona_horaria" TEXT NOT NULL DEFAULT 'America/Asuncion',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_empresa" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "permitir_stock_negativo" BOOLEAN NOT NULL DEFAULT true,
    "redondear_totales" BOOLEAN NOT NULL DEFAULT true,
    "iva_incluido_en_precio" BOOLEAN NOT NULL DEFAULT true,
    "emitir_ticket_por_defecto" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursal" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "establecimiento" CHAR(3) NOT NULL,
    "direccion" TEXT NOT NULL,
    "ciudad" TEXT,
    "departamento" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "zona_horaria" TEXT,
    "horarios" JSONB,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punto_expedicion" (
    "id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "codigo" CHAR(3) NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "punto_expedicion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timbrado" (
    "id" TEXT NOT NULL,
    "punto_expedicion_id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha_inicio_vigencia" DATE NOT NULL,
    "fecha_fin_vigencia" DATE NOT NULL,
    "rango_desde" INTEGER NOT NULL,
    "rango_hasta" INTEGER NOT NULL,
    "ultimo_numero_usado" INTEGER NOT NULL DEFAULT 0,
    "tipo_documento" "TipoDocumentoFiscal" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timbrado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "documento" TEXT,
    "telefono" TEXT,
    "rol" "Rol" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_sucursal" (
    "usuario_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_sucursal_pkey" PRIMARY KEY ("usuario_id","sucursal_id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "revocado_en" TIMESTAMP(3),
    "reemplazado_por_id" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permiso" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,

    CONSTRAINT "permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_permiso" (
    "usuario_id" TEXT NOT NULL,
    "permiso_id" TEXT NOT NULL,
    "concedido" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_permiso_pkey" PRIMARY KEY ("usuario_id","permiso_id")
);

-- CreateTable
CREATE TABLE "cliente" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "tipo_contribuyente" "TipoContribuyente" NOT NULL,
    "ruc" TEXT,
    "dv" CHAR(1),
    "documento" TEXT,
    "razon_social" TEXT NOT NULL,
    "nombre_fantasia" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "es_consumidor_final" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direccion_cliente" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "alias" TEXT,
    "direccion" TEXT NOT NULL,
    "ciudad" TEXT,
    "departamento" TEXT,
    "referencias" TEXT,
    "latitud" DECIMAL(10,7),
    "longitud" DECIMAL(10,7),
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direccion_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria_producto_empresa" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "categoria_base" "CategoriaProducto" NOT NULL DEFAULT 'OTRO',
    "orden_menu" INTEGER NOT NULL DEFAULT 0,
    "icono_url" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "categoria_producto_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedor" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "ruc" TEXT,
    "dv" CHAR(1),
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "contacto" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_inventario" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "proveedor_id" TEXT,
    "codigo" TEXT,
    "codigo_barras" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "unidad_medida" "UnidadMedida" NOT NULL,
    "costo_unitario" BIGINT NOT NULL DEFAULT 0,
    "categoria" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "producto_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_sucursal" (
    "id" TEXT NOT NULL,
    "producto_inventario_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "stock_actual" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "stock_minimo" DECIMAL(15,3) NOT NULL DEFAULT 0,
    "stock_maximo" DECIMAL(15,3),
    "costo_promedio" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_venta" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "categoria_id" TEXT,
    "codigo" TEXT,
    "codigo_barras" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio_base" BIGINT NOT NULL,
    "tasa_iva" "TasaIva" NOT NULL DEFAULT 'IVA_10',
    "imagen_url" TEXT,
    "sector_comanda" "SectorComanda",
    "tiempo_prep_segundos" INTEGER,
    "es_combo" BOOLEAN NOT NULL DEFAULT false,
    "es_vendible" BOOLEAN NOT NULL DEFAULT true,
    "es_preparacion" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "producto_venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precio_por_sucursal" (
    "id" TEXT NOT NULL,
    "producto_venta_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "precio" BIGINT NOT NULL,
    "vigente_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigente_hasta" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "precio_por_sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receta" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "producto_venta_id" TEXT NOT NULL,
    "rinde" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "receta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_receta" (
    "id" TEXT NOT NULL,
    "receta_id" TEXT NOT NULL,
    "producto_inventario_id" TEXT,
    "sub_producto_venta_id" TEXT,
    "cantidad" DECIMAL(15,3) NOT NULL,
    "unidad_medida" "UnidadMedida" NOT NULL,
    "es_opcional" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_receta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "producto_venta_id" TEXT NOT NULL,
    "descripcion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_grupo" (
    "id" TEXT NOT NULL,
    "combo_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "tipo" "TipoModificadorGrupo" NOT NULL DEFAULT 'UNICA',
    "obligatorio" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combo_grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_grupo_opcion" (
    "id" TEXT NOT NULL,
    "combo_grupo_id" TEXT NOT NULL,
    "producto_venta_id" TEXT NOT NULL,
    "precio_extra" BIGINT NOT NULL DEFAULT 0,
    "es_default" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combo_grupo_opcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modificador_grupo" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoModificadorGrupo" NOT NULL DEFAULT 'MULTIPLE',
    "obligatorio" BOOLEAN NOT NULL DEFAULT false,
    "min_seleccion" INTEGER NOT NULL DEFAULT 0,
    "max_seleccion" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "modificador_grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modificador_opcion" (
    "id" TEXT NOT NULL,
    "modificador_grupo_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio_extra" BIGINT NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modificador_opcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producto_venta_modificador_grupo" (
    "producto_venta_id" TEXT NOT NULL,
    "modificador_grupo_id" TEXT NOT NULL,
    "orden_en_producto" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_venta_modificador_grupo_pkey" PRIMARY KEY ("producto_venta_id","modificador_grupo_id")
);

-- CreateTable
CREATE TABLE "movimiento_stock" (
    "id" TEXT NOT NULL,
    "producto_inventario_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "tipo" "TipoMovimientoStock" NOT NULL,
    "cantidad" DECIMAL(15,3) NOT NULL,
    "cantidad_signed" DECIMAL(15,3) NOT NULL,
    "costo_unitario" BIGINT NOT NULL DEFAULT 0,
    "motivo" TEXT,
    "pedido_id" TEXT,
    "transferencia_id" TEXT,
    "compra_id" TEXT,
    "item_receta_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transferencia_stock" (
    "id" TEXT NOT NULL,
    "sucursal_origen_id" TEXT NOT NULL,
    "sucursal_destino_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "estado" "EstadoTransferencia" NOT NULL DEFAULT 'PENDIENTE',
    "solicitado_por" TEXT NOT NULL,
    "aprobado_por" TEXT,
    "recibido_por" TEXT,
    "fecha_solicitud" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_aprobacion" TIMESTAMP(3),
    "fecha_recepcion" TIMESTAMP(3),
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transferencia_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_transferencia" (
    "id" TEXT NOT NULL,
    "transferencia_id" TEXT NOT NULL,
    "producto_inventario_id" TEXT NOT NULL,
    "cantidad_solicitada" DECIMAL(15,3) NOT NULL,
    "cantidad_enviada" DECIMAL(15,3),
    "cantidad_recibida" DECIMAL(15,3),
    "notas" TEXT,

    CONSTRAINT "item_transferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compra" (
    "id" TEXT NOT NULL,
    "proveedor_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "numero_factura" TEXT,
    "total" BIGINT NOT NULL DEFAULT 0,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_compra" (
    "id" TEXT NOT NULL,
    "compra_id" TEXT NOT NULL,
    "producto_inventario_id" TEXT NOT NULL,
    "cantidad" DECIMAL(15,3) NOT NULL,
    "costo_unitario" BIGINT NOT NULL,
    "subtotal" BIGINT NOT NULL,

    CONSTRAINT "item_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zona_mesa" (
    "id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zona_mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mesa" (
    "id" TEXT NOT NULL,
    "zona_mesa_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "capacidad" INTEGER NOT NULL DEFAULT 4,
    "estado" "EstadoMesa" NOT NULL DEFAULT 'LIBRE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" "TipoPedido" NOT NULL,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDIENTE',
    "cliente_id" TEXT,
    "direccion_entrega_id" TEXT,
    "mesa_id" TEXT,
    "tomado_por_id" TEXT,
    "observaciones" TEXT,
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "total_descuento" BIGINT NOT NULL DEFAULT 0,
    "total_iva" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "tomado_en" TIMESTAMP(3),
    "confirmado_en" TIMESTAMP(3),
    "en_preparacion_en" TIMESTAMP(3),
    "listo_en" TIMESTAMP(3),
    "en_camino_en" TIMESTAMP(3),
    "entregado_en" TIMESTAMP(3),
    "cancelado_en" TIMESTAMP(3),
    "motivo_cancel" TEXT,
    "pedidos_ya_pedido_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_pedido" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT NOT NULL,
    "producto_venta_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "precio_unitario" BIGINT NOT NULL,
    "precio_modificadores" BIGINT NOT NULL DEFAULT 0,
    "subtotal" BIGINT NOT NULL,
    "observaciones" TEXT,
    "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDIENTE',
    "sector_comanda" "SectorComanda",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_pedido_modificador" (
    "id" TEXT NOT NULL,
    "item_pedido_id" TEXT NOT NULL,
    "modificador_opcion_id" TEXT NOT NULL,
    "precio_extra" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_pedido_modificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_pedido_combo_opcion" (
    "id" TEXT NOT NULL,
    "item_pedido_id" TEXT NOT NULL,
    "combo_grupo_id" TEXT NOT NULL,
    "combo_grupo_opcion_id" TEXT NOT NULL,
    "precio_extra" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_pedido_combo_opcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja" (
    "id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "punto_expedicion_id" TEXT,
    "nombre" TEXT NOT NULL,
    "estado" "EstadoCaja" NOT NULL DEFAULT 'CERRADA',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apertura_caja" (
    "id" TEXT NOT NULL,
    "caja_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "monto_inicial" BIGINT NOT NULL,
    "notas" TEXT,
    "abierta_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apertura_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierre_caja" (
    "id" TEXT NOT NULL,
    "caja_id" TEXT NOT NULL,
    "apertura_caja_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "total_esperado_efectivo" BIGINT NOT NULL,
    "total_contado_efectivo" BIGINT NOT NULL,
    "diferencia_efectivo" BIGINT NOT NULL,
    "total_ventas" BIGINT NOT NULL,
    "totales_por_metodo" JSONB NOT NULL,
    "conteo_efectivo" JSONB,
    "notas" TEXT,
    "cerrada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cierre_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_caja" (
    "id" TEXT NOT NULL,
    "caja_id" TEXT NOT NULL,
    "apertura_caja_id" TEXT,
    "tipo" "TipoMovimientoCaja" NOT NULL,
    "metodo_pago" "MetodoPago",
    "monto" BIGINT NOT NULL,
    "concepto" TEXT,
    "comprobante_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobante" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "punto_expedicion_id" TEXT NOT NULL,
    "timbrado_id" TEXT NOT NULL,
    "caja_id" TEXT,
    "apertura_caja_id" TEXT,
    "pedido_id" TEXT,
    "cliente_id" TEXT NOT NULL,
    "emitido_por_id" TEXT NOT NULL,
    "tipo_documento" "TipoDocumentoFiscal" NOT NULL,
    "establecimiento" CHAR(3) NOT NULL,
    "punto_expedicion_codigo" CHAR(3) NOT NULL,
    "numero" INTEGER NOT NULL,
    "numero_documento" TEXT NOT NULL,
    "fecha_emision" TIMESTAMP(3) NOT NULL,
    "condicion_venta" "CondicionVenta" NOT NULL DEFAULT 'CONTADO',
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'EMITIDO',
    "receptor_tipo_contribuyente" "TipoContribuyente" NOT NULL,
    "receptor_ruc" TEXT,
    "receptor_dv" CHAR(1),
    "receptor_documento" TEXT,
    "receptor_razon_social" TEXT NOT NULL,
    "receptor_email" TEXT,
    "receptor_direccion" TEXT,
    "subtotal_exentas" BIGINT NOT NULL DEFAULT 0,
    "subtotal_iva_5" BIGINT NOT NULL DEFAULT 0,
    "subtotal_iva_10" BIGINT NOT NULL DEFAULT 0,
    "total_iva_5" BIGINT NOT NULL DEFAULT 0,
    "total_iva_10" BIGINT NOT NULL DEFAULT 0,
    "total_descuento" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "comprobante_original_id" TEXT,
    "anulado_en" TIMESTAMP(3),
    "motivo_anulacion" TEXT,
    "cdc" CHAR(44),
    "xml_firmado" TEXT,
    "estado_sifen" "EstadoSifen" NOT NULL DEFAULT 'NO_ENVIADO',
    "fecha_envio_sifen" TIMESTAMP(3),
    "fecha_aprobacion_sifen" TIMESTAMP(3),
    "motivo_rechazo_sifen" TEXT,
    "qr_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_comprobante" (
    "id" TEXT NOT NULL,
    "comprobante_id" TEXT NOT NULL,
    "producto_venta_id" TEXT,
    "codigo" TEXT,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" BIGINT NOT NULL,
    "descuento_unitario" BIGINT NOT NULL DEFAULT 0,
    "tasa_iva" "TasaIva" NOT NULL,
    "subtotal" BIGINT NOT NULL,

    CONSTRAINT "item_comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago_comprobante" (
    "id" TEXT NOT NULL,
    "comprobante_id" TEXT NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "monto" BIGINT NOT NULL,
    "referencia" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pago_comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_sifen" (
    "id" TEXT NOT NULL,
    "comprobante_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "motivo" TEXT,
    "xml_enviado" TEXT,
    "xml_respuesta" TEXT,
    "estado" TEXT NOT NULL,
    "enviado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondido_en" TIMESTAMP(3),

    CONSTRAINT "evento_sifen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_ya_pedido" (
    "id" TEXT NOT NULL,
    "pedido_id" TEXT,
    "external_id" TEXT NOT NULL,
    "estado" "EstadoPedidosYa" NOT NULL,
    "payload_original" JSONB NOT NULL,
    "total_enviado" BIGINT NOT NULL,
    "notas" TEXT,
    "recibido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aceptado_en" TIMESTAMP(3),
    "rechazado_en" TIMESTAMP(3),
    "motivo_rechazo" TEXT,

    CONSTRAINT "pedidos_ya_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_ya_log" (
    "id" TEXT NOT NULL,
    "pedidos_ya_pedido_id" TEXT,
    "direccion" TEXT NOT NULL,
    "endpoint" TEXT,
    "payload" JSONB NOT NULL,
    "status_http" INTEGER,
    "error_mensaje" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_ya_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_ya_producto_mapping" (
    "id" TEXT NOT NULL,
    "external_product_id" TEXT NOT NULL,
    "producto_venta_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_ya_producto_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT,
    "sucursal_id" TEXT,
    "usuario_id" TEXT,
    "accion" "AccionAuditable" NOT NULL,
    "entidad" TEXT,
    "entidad_id" TEXT,
    "diff" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresa_ruc_key" ON "empresa"("ruc");

-- CreateIndex
CREATE INDEX "empresa_deleted_at_idx" ON "empresa"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_empresa_empresa_id_key" ON "configuracion_empresa"("empresa_id");

-- CreateIndex
CREATE INDEX "sucursal_empresa_id_deleted_at_idx" ON "sucursal"("empresa_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "sucursal_empresa_id_codigo_key" ON "sucursal"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "sucursal_empresa_id_establecimiento_key" ON "sucursal"("empresa_id", "establecimiento");

-- CreateIndex
CREATE INDEX "punto_expedicion_sucursal_id_deleted_at_idx" ON "punto_expedicion"("sucursal_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "punto_expedicion_sucursal_id_codigo_key" ON "punto_expedicion"("sucursal_id", "codigo");

-- CreateIndex
CREATE INDEX "timbrado_punto_expedicion_id_activo_fecha_fin_vigencia_idx" ON "timbrado"("punto_expedicion_id", "activo", "fecha_fin_vigencia");

-- CreateIndex
CREATE UNIQUE INDEX "timbrado_punto_expedicion_id_numero_tipo_documento_key" ON "timbrado"("punto_expedicion_id", "numero", "tipo_documento");

-- CreateIndex
CREATE INDEX "usuario_empresa_id_deleted_at_idx" ON "usuario"("empresa_id", "deleted_at");

-- CreateIndex
CREATE INDEX "usuario_rol_idx" ON "usuario"("rol");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_empresa_id_email_key" ON "usuario"("empresa_id", "email");

-- CreateIndex
CREATE INDEX "usuario_sucursal_sucursal_id_idx" ON "usuario_sucursal"("sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_usuario_id_revocado_en_idx" ON "refresh_token"("usuario_id", "revocado_en");

-- CreateIndex
CREATE INDEX "refresh_token_expira_en_idx" ON "refresh_token"("expira_en");

-- CreateIndex
CREATE UNIQUE INDEX "permiso_codigo_key" ON "permiso"("codigo");

-- CreateIndex
CREATE INDEX "usuario_permiso_permiso_id_idx" ON "usuario_permiso"("permiso_id");

-- CreateIndex
CREATE INDEX "cliente_empresa_id_es_consumidor_final_idx" ON "cliente"("empresa_id", "es_consumidor_final");

-- CreateIndex
CREATE INDEX "cliente_empresa_id_razon_social_idx" ON "cliente"("empresa_id", "razon_social");

-- CreateIndex
CREATE INDEX "cliente_empresa_id_telefono_idx" ON "cliente"("empresa_id", "telefono");

-- CreateIndex
CREATE INDEX "cliente_empresa_id_deleted_at_idx" ON "cliente"("empresa_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_empresa_id_ruc_dv_key" ON "cliente"("empresa_id", "ruc", "dv");

-- CreateIndex
CREATE UNIQUE INDEX "cliente_empresa_id_documento_key" ON "cliente"("empresa_id", "documento");

-- CreateIndex
CREATE INDEX "direccion_cliente_cliente_id_idx" ON "direccion_cliente"("cliente_id");

-- CreateIndex
CREATE INDEX "categoria_producto_empresa_empresa_id_deleted_at_idx" ON "categoria_producto_empresa"("empresa_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_producto_empresa_empresa_id_nombre_key" ON "categoria_producto_empresa"("empresa_id", "nombre");

-- CreateIndex
CREATE INDEX "proveedor_empresa_id_deleted_at_idx" ON "proveedor"("empresa_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "proveedor_empresa_id_ruc_dv_key" ON "proveedor"("empresa_id", "ruc", "dv");

-- CreateIndex
CREATE INDEX "producto_inventario_empresa_id_nombre_idx" ON "producto_inventario"("empresa_id", "nombre");

-- CreateIndex
CREATE INDEX "producto_inventario_empresa_id_deleted_at_idx" ON "producto_inventario"("empresa_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "producto_inventario_empresa_id_codigo_barras_key" ON "producto_inventario"("empresa_id", "codigo_barras");

-- CreateIndex
CREATE UNIQUE INDEX "producto_inventario_empresa_id_codigo_key" ON "producto_inventario"("empresa_id", "codigo");

-- CreateIndex
CREATE INDEX "stock_sucursal_sucursal_id_idx" ON "stock_sucursal"("sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_sucursal_producto_inventario_id_sucursal_id_key" ON "stock_sucursal"("producto_inventario_id", "sucursal_id");

-- CreateIndex
CREATE INDEX "producto_venta_empresa_id_categoria_id_activo_deleted_at_idx" ON "producto_venta"("empresa_id", "categoria_id", "activo", "deleted_at");

-- CreateIndex
CREATE INDEX "producto_venta_empresa_id_nombre_idx" ON "producto_venta"("empresa_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "producto_venta_empresa_id_codigo_key" ON "producto_venta"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "producto_venta_empresa_id_codigo_barras_key" ON "producto_venta"("empresa_id", "codigo_barras");

-- CreateIndex
CREATE INDEX "precio_por_sucursal_sucursal_id_producto_venta_id_vigente_h_idx" ON "precio_por_sucursal"("sucursal_id", "producto_venta_id", "vigente_hasta");

-- CreateIndex
CREATE UNIQUE INDEX "precio_por_sucursal_producto_venta_id_sucursal_id_vigente_d_key" ON "precio_por_sucursal"("producto_venta_id", "sucursal_id", "vigente_desde");

-- CreateIndex
CREATE UNIQUE INDEX "receta_producto_venta_id_key" ON "receta"("producto_venta_id");

-- CreateIndex
CREATE INDEX "receta_empresa_id_deleted_at_idx" ON "receta"("empresa_id", "deleted_at");

-- CreateIndex
CREATE INDEX "item_receta_receta_id_idx" ON "item_receta"("receta_id");

-- CreateIndex
CREATE INDEX "item_receta_producto_inventario_id_idx" ON "item_receta"("producto_inventario_id");

-- CreateIndex
CREATE INDEX "item_receta_sub_producto_venta_id_idx" ON "item_receta"("sub_producto_venta_id");

-- CreateIndex
CREATE UNIQUE INDEX "combo_producto_venta_id_key" ON "combo"("producto_venta_id");

-- CreateIndex
CREATE INDEX "combo_grupo_combo_id_idx" ON "combo_grupo"("combo_id");

-- CreateIndex
CREATE INDEX "combo_grupo_opcion_combo_grupo_id_idx" ON "combo_grupo_opcion"("combo_grupo_id");

-- CreateIndex
CREATE UNIQUE INDEX "combo_grupo_opcion_combo_grupo_id_producto_venta_id_key" ON "combo_grupo_opcion"("combo_grupo_id", "producto_venta_id");

-- CreateIndex
CREATE INDEX "modificador_grupo_empresa_id_deleted_at_idx" ON "modificador_grupo"("empresa_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "modificador_grupo_empresa_id_nombre_key" ON "modificador_grupo"("empresa_id", "nombre");

-- CreateIndex
CREATE INDEX "modificador_opcion_modificador_grupo_id_idx" ON "modificador_opcion"("modificador_grupo_id");

-- CreateIndex
CREATE INDEX "producto_venta_modificador_grupo_modificador_grupo_id_idx" ON "producto_venta_modificador_grupo"("modificador_grupo_id");

-- CreateIndex
CREATE INDEX "movimiento_stock_producto_inventario_id_sucursal_id_created_idx" ON "movimiento_stock"("producto_inventario_id", "sucursal_id", "created_at");

-- CreateIndex
CREATE INDEX "movimiento_stock_sucursal_id_created_at_idx" ON "movimiento_stock"("sucursal_id", "created_at");

-- CreateIndex
CREATE INDEX "movimiento_stock_pedido_id_idx" ON "movimiento_stock"("pedido_id");

-- CreateIndex
CREATE INDEX "movimiento_stock_transferencia_id_idx" ON "movimiento_stock"("transferencia_id");

-- CreateIndex
CREATE INDEX "movimiento_stock_compra_id_idx" ON "movimiento_stock"("compra_id");

-- CreateIndex
CREATE INDEX "transferencia_stock_sucursal_origen_id_estado_idx" ON "transferencia_stock"("sucursal_origen_id", "estado");

-- CreateIndex
CREATE INDEX "transferencia_stock_sucursal_destino_id_estado_idx" ON "transferencia_stock"("sucursal_destino_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "transferencia_stock_sucursal_origen_id_numero_key" ON "transferencia_stock"("sucursal_origen_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "item_transferencia_transferencia_id_producto_inventario_id_key" ON "item_transferencia"("transferencia_id", "producto_inventario_id");

-- CreateIndex
CREATE INDEX "compra_proveedor_id_fecha_idx" ON "compra"("proveedor_id", "fecha");

-- CreateIndex
CREATE INDEX "compra_sucursal_id_fecha_idx" ON "compra"("sucursal_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "compra_sucursal_id_numero_key" ON "compra"("sucursal_id", "numero");

-- CreateIndex
CREATE INDEX "item_compra_compra_id_idx" ON "item_compra"("compra_id");

-- CreateIndex
CREATE UNIQUE INDEX "zona_mesa_sucursal_id_nombre_key" ON "zona_mesa"("sucursal_id", "nombre");

-- CreateIndex
CREATE INDEX "mesa_estado_idx" ON "mesa"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "mesa_zona_mesa_id_numero_key" ON "mesa"("zona_mesa_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_pedidos_ya_pedido_id_key" ON "pedido"("pedidos_ya_pedido_id");

-- CreateIndex
CREATE INDEX "pedido_empresa_id_estado_created_at_idx" ON "pedido"("empresa_id", "estado", "created_at");

-- CreateIndex
CREATE INDEX "pedido_sucursal_id_estado_created_at_idx" ON "pedido"("sucursal_id", "estado", "created_at");

-- CreateIndex
CREATE INDEX "pedido_sucursal_id_tipo_estado_idx" ON "pedido"("sucursal_id", "tipo", "estado");

-- CreateIndex
CREATE INDEX "pedido_cliente_id_idx" ON "pedido"("cliente_id");

-- CreateIndex
CREATE INDEX "pedido_mesa_id_idx" ON "pedido"("mesa_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_sucursal_id_numero_key" ON "pedido"("sucursal_id", "numero");

-- CreateIndex
CREATE INDEX "item_pedido_pedido_id_idx" ON "item_pedido"("pedido_id");

-- CreateIndex
CREATE INDEX "item_pedido_producto_venta_id_idx" ON "item_pedido"("producto_venta_id");

-- CreateIndex
CREATE INDEX "item_pedido_sector_comanda_estado_idx" ON "item_pedido"("sector_comanda", "estado");

-- CreateIndex
CREATE INDEX "item_pedido_modificador_modificador_opcion_id_idx" ON "item_pedido_modificador"("modificador_opcion_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_pedido_modificador_item_pedido_id_modificador_opcion_i_key" ON "item_pedido_modificador"("item_pedido_id", "modificador_opcion_id");

-- CreateIndex
CREATE INDEX "item_pedido_combo_opcion_combo_grupo_opcion_id_idx" ON "item_pedido_combo_opcion"("combo_grupo_opcion_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_pedido_combo_opcion_item_pedido_id_combo_grupo_id_key" ON "item_pedido_combo_opcion"("item_pedido_id", "combo_grupo_id");

-- CreateIndex
CREATE INDEX "caja_sucursal_id_estado_idx" ON "caja"("sucursal_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "caja_sucursal_id_nombre_key" ON "caja"("sucursal_id", "nombre");

-- CreateIndex
CREATE INDEX "apertura_caja_caja_id_abierta_en_idx" ON "apertura_caja"("caja_id", "abierta_en");

-- CreateIndex
CREATE INDEX "apertura_caja_usuario_id_idx" ON "apertura_caja"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "cierre_caja_apertura_caja_id_key" ON "cierre_caja"("apertura_caja_id");

-- CreateIndex
CREATE INDEX "cierre_caja_caja_id_cerrada_en_idx" ON "cierre_caja"("caja_id", "cerrada_en");

-- CreateIndex
CREATE INDEX "movimiento_caja_caja_id_created_at_idx" ON "movimiento_caja"("caja_id", "created_at");

-- CreateIndex
CREATE INDEX "movimiento_caja_apertura_caja_id_idx" ON "movimiento_caja"("apertura_caja_id");

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_cdc_key" ON "comprobante"("cdc");

-- CreateIndex
CREATE INDEX "comprobante_empresa_id_fecha_emision_idx" ON "comprobante"("empresa_id", "fecha_emision");

-- CreateIndex
CREATE INDEX "comprobante_sucursal_id_fecha_emision_idx" ON "comprobante"("sucursal_id", "fecha_emision");

-- CreateIndex
CREATE INDEX "comprobante_cliente_id_idx" ON "comprobante"("cliente_id");

-- CreateIndex
CREATE INDEX "comprobante_estado_estado_sifen_idx" ON "comprobante"("estado", "estado_sifen");

-- CreateIndex
CREATE INDEX "comprobante_numero_documento_idx" ON "comprobante"("numero_documento");

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_sucursal_id_tipo_documento_establecimiento_punt_key" ON "comprobante"("sucursal_id", "tipo_documento", "establecimiento", "punto_expedicion_codigo", "numero");

-- CreateIndex
CREATE INDEX "item_comprobante_comprobante_id_idx" ON "item_comprobante"("comprobante_id");

-- CreateIndex
CREATE INDEX "pago_comprobante_comprobante_id_idx" ON "pago_comprobante"("comprobante_id");

-- CreateIndex
CREATE INDEX "pago_comprobante_metodo_idx" ON "pago_comprobante"("metodo");

-- CreateIndex
CREATE INDEX "evento_sifen_comprobante_id_tipo_idx" ON "evento_sifen"("comprobante_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_ya_pedido_pedido_id_key" ON "pedidos_ya_pedido"("pedido_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_ya_pedido_external_id_key" ON "pedidos_ya_pedido"("external_id");

-- CreateIndex
CREATE INDEX "pedidos_ya_pedido_estado_idx" ON "pedidos_ya_pedido"("estado");

-- CreateIndex
CREATE INDEX "pedidos_ya_log_pedidos_ya_pedido_id_created_at_idx" ON "pedidos_ya_log"("pedidos_ya_pedido_id", "created_at");

-- CreateIndex
CREATE INDEX "pedidos_ya_log_created_at_idx" ON "pedidos_ya_log"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_ya_producto_mapping_external_product_id_producto_ve_key" ON "pedidos_ya_producto_mapping"("external_product_id", "producto_venta_id");

-- CreateIndex
CREATE INDEX "audit_log_empresa_id_created_at_idx" ON "audit_log"("empresa_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_sucursal_id_created_at_idx" ON "audit_log"("sucursal_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_usuario_id_created_at_idx" ON "audit_log"("usuario_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entidad_entidad_id_idx" ON "audit_log"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "audit_log_accion_created_at_idx" ON "audit_log"("accion", "created_at");

-- AddForeignKey
ALTER TABLE "configuracion_empresa" ADD CONSTRAINT "configuracion_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursal" ADD CONSTRAINT "sucursal_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punto_expedicion" ADD CONSTRAINT "punto_expedicion_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timbrado" ADD CONSTRAINT "timbrado_punto_expedicion_id_fkey" FOREIGN KEY ("punto_expedicion_id") REFERENCES "punto_expedicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sucursal" ADD CONSTRAINT "usuario_sucursal_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sucursal" ADD CONSTRAINT "usuario_sucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_permiso" ADD CONSTRAINT "usuario_permiso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_permiso" ADD CONSTRAINT "usuario_permiso_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permiso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direccion_cliente" ADD CONSTRAINT "direccion_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categoria_producto_empresa" ADD CONSTRAINT "categoria_producto_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedor" ADD CONSTRAINT "proveedor_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_inventario" ADD CONSTRAINT "producto_inventario_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_inventario" ADD CONSTRAINT "producto_inventario_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_sucursal" ADD CONSTRAINT "stock_sucursal_producto_inventario_id_fkey" FOREIGN KEY ("producto_inventario_id") REFERENCES "producto_inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_sucursal" ADD CONSTRAINT "stock_sucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_venta" ADD CONSTRAINT "producto_venta_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_venta" ADD CONSTRAINT "producto_venta_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_producto_empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precio_por_sucursal" ADD CONSTRAINT "precio_por_sucursal_producto_venta_id_fkey" FOREIGN KEY ("producto_venta_id") REFERENCES "producto_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precio_por_sucursal" ADD CONSTRAINT "precio_por_sucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta" ADD CONSTRAINT "receta_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta" ADD CONSTRAINT "receta_producto_venta_id_fkey" FOREIGN KEY ("producto_venta_id") REFERENCES "producto_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_receta" ADD CONSTRAINT "item_receta_receta_id_fkey" FOREIGN KEY ("receta_id") REFERENCES "receta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_receta" ADD CONSTRAINT "item_receta_producto_inventario_id_fkey" FOREIGN KEY ("producto_inventario_id") REFERENCES "producto_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_receta" ADD CONSTRAINT "item_receta_sub_producto_venta_id_fkey" FOREIGN KEY ("sub_producto_venta_id") REFERENCES "producto_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo" ADD CONSTRAINT "combo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo" ADD CONSTRAINT "combo_producto_venta_id_fkey" FOREIGN KEY ("producto_venta_id") REFERENCES "producto_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_grupo" ADD CONSTRAINT "combo_grupo_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_grupo_opcion" ADD CONSTRAINT "combo_grupo_opcion_combo_grupo_id_fkey" FOREIGN KEY ("combo_grupo_id") REFERENCES "combo_grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_grupo_opcion" ADD CONSTRAINT "combo_grupo_opcion_producto_venta_id_fkey" FOREIGN KEY ("producto_venta_id") REFERENCES "producto_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modificador_grupo" ADD CONSTRAINT "modificador_grupo_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modificador_opcion" ADD CONSTRAINT "modificador_opcion_modificador_grupo_id_fkey" FOREIGN KEY ("modificador_grupo_id") REFERENCES "modificador_grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_venta_modificador_grupo" ADD CONSTRAINT "producto_venta_modificador_grupo_producto_venta_id_fkey" FOREIGN KEY ("producto_venta_id") REFERENCES "producto_venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto_venta_modificador_grupo" ADD CONSTRAINT "producto_venta_modificador_grupo_modificador_grupo_id_fkey" FOREIGN KEY ("modificador_grupo_id") REFERENCES "modificador_grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_producto_inventario_id_fkey" FOREIGN KEY ("producto_inventario_id") REFERENCES "producto_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_stock" ADD CONSTRAINT "transferencia_stock_sucursal_origen_id_fkey" FOREIGN KEY ("sucursal_origen_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_stock" ADD CONSTRAINT "transferencia_stock_sucursal_destino_id_fkey" FOREIGN KEY ("sucursal_destino_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_transferencia" ADD CONSTRAINT "item_transferencia_transferencia_id_fkey" FOREIGN KEY ("transferencia_id") REFERENCES "transferencia_stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_transferencia" ADD CONSTRAINT "item_transferencia_producto_inventario_id_fkey" FOREIGN KEY ("producto_inventario_id") REFERENCES "producto_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra" ADD CONSTRAINT "compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra" ADD CONSTRAINT "compra_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_compra" ADD CONSTRAINT "item_compra_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_compra" ADD CONSTRAINT "item_compra_producto_inventario_id_fkey" FOREIGN KEY ("producto_inventario_id") REFERENCES "producto_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zona_mesa" ADD CONSTRAINT "zona_mesa_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesa" ADD CONSTRAINT "mesa_zona_mesa_id_fkey" FOREIGN KEY ("zona_mesa_id") REFERENCES "zona_mesa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_direccion_entrega_id_fkey" FOREIGN KEY ("direccion_entrega_id") REFERENCES "direccion_cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_tomado_por_id_fkey" FOREIGN KEY ("tomado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido" ADD CONSTRAINT "item_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido" ADD CONSTRAINT "item_pedido_producto_venta_id_fkey" FOREIGN KEY ("producto_venta_id") REFERENCES "producto_venta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido_modificador" ADD CONSTRAINT "item_pedido_modificador_item_pedido_id_fkey" FOREIGN KEY ("item_pedido_id") REFERENCES "item_pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido_modificador" ADD CONSTRAINT "item_pedido_modificador_modificador_opcion_id_fkey" FOREIGN KEY ("modificador_opcion_id") REFERENCES "modificador_opcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido_combo_opcion" ADD CONSTRAINT "item_pedido_combo_opcion_item_pedido_id_fkey" FOREIGN KEY ("item_pedido_id") REFERENCES "item_pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido_combo_opcion" ADD CONSTRAINT "item_pedido_combo_opcion_combo_grupo_id_fkey" FOREIGN KEY ("combo_grupo_id") REFERENCES "combo_grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_pedido_combo_opcion" ADD CONSTRAINT "item_pedido_combo_opcion_combo_grupo_opcion_id_fkey" FOREIGN KEY ("combo_grupo_opcion_id") REFERENCES "combo_grupo_opcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja" ADD CONSTRAINT "caja_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja" ADD CONSTRAINT "caja_punto_expedicion_id_fkey" FOREIGN KEY ("punto_expedicion_id") REFERENCES "punto_expedicion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apertura_caja" ADD CONSTRAINT "apertura_caja_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apertura_caja" ADD CONSTRAINT "apertura_caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierre_caja" ADD CONSTRAINT "cierre_caja_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierre_caja" ADD CONSTRAINT "cierre_caja_apertura_caja_id_fkey" FOREIGN KEY ("apertura_caja_id") REFERENCES "apertura_caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierre_caja" ADD CONSTRAINT "cierre_caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "caja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_apertura_caja_id_fkey" FOREIGN KEY ("apertura_caja_id") REFERENCES "apertura_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_caja" ADD CONSTRAINT "movimiento_caja_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_punto_expedicion_id_fkey" FOREIGN KEY ("punto_expedicion_id") REFERENCES "punto_expedicion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_timbrado_id_fkey" FOREIGN KEY ("timbrado_id") REFERENCES "timbrado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_apertura_caja_id_fkey" FOREIGN KEY ("apertura_caja_id") REFERENCES "apertura_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_emitido_por_id_fkey" FOREIGN KEY ("emitido_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_comprobante_original_id_fkey" FOREIGN KEY ("comprobante_original_id") REFERENCES "comprobante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_comprobante" ADD CONSTRAINT "item_comprobante_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "comprobante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_comprobante" ADD CONSTRAINT "pago_comprobante_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "comprobante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_sifen" ADD CONSTRAINT "evento_sifen_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "comprobante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_ya_pedido" ADD CONSTRAINT "pedidos_ya_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_ya_log" ADD CONSTRAINT "pedidos_ya_log_pedidos_ya_pedido_id_fkey" FOREIGN KEY ("pedidos_ya_pedido_id") REFERENCES "pedidos_ya_pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
