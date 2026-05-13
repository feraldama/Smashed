import { Prisma } from '@prisma/client';

import { prisma } from '../../lib/prisma.js';

import type {
  RangoFechasQuery,
  RentabilidadQuery,
  StockQuery,
  TopQuery,
} from './reportes.schemas.js';

/**
 * Servicio de reportes.
 *
 * Usa SQL crudo (Prisma.$queryRaw) para queries agregadas pesadas.
 * Todas las consultas filtran SIEMPRE por empresa_id como primer parámetro.
 * Las fechas se convierten a tz America/Asuncion para agrupar por día/hora local.
 */

interface UserCtx {
  empresaId: string;
  sucursalActivaId: string | null;
  rol: string;
  isSuperAdmin: boolean;
}

/** Si el usuario tiene sucursal activa y rol no-admin, fuerza filtro por su sucursal. */
function efectiveSucursalId(
  user: UserCtx,
  sucursalIdInput: string | undefined,
): string | undefined {
  if (user.isSuperAdmin) return sucursalIdInput;
  if (user.rol === 'ADMIN_EMPRESA') return sucursalIdInput; // admin puede ver consolidado o filtrar
  // Gerentes y operativos solo ven su sucursal activa
  return user.sucursalActivaId ?? undefined;
}

// ───── helpers SQL ─────

function sucursalFragment(sucursalId: string | undefined, alias = 'c') {
  return sucursalId
    ? Prisma.sql`AND ${Prisma.raw(`"${alias}"`)}."sucursal_id" = ${sucursalId}`
    : Prisma.empty;
}

// ═══════════════════════════════════════════════════════════════════════════
//  VENTAS
// ═══════════════════════════════════════════════════════════════════════════

export async function resumenVentas(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  const rows = await prisma.$queryRaw<
    {
      total: bigint | null;
      cantidad: bigint | null;
      ticket_promedio: bigint | null;
      iva_total: bigint | null;
    }[]
  >`
    SELECT
      COALESCE(SUM("total"), 0)::bigint AS total,
      COUNT(*)::bigint AS cantidad,
      COALESCE(AVG("total"), 0)::bigint AS ticket_promedio,
      COALESCE(SUM("total_iva_10") + SUM("total_iva_5"), 0)::bigint AS iva_total
    FROM comprobante c
    WHERE
      c."empresa_id" = ${user.empresaId}
      AND c."estado" = 'EMITIDO'
      AND c."deleted_at" IS NULL
      AND c."fecha_emision" >= ${q.desde}
      AND c."fecha_emision" <= ${q.hasta}
      ${sucursalFragment(sucursalId)}
  `;

  const r = rows[0];
  return {
    total: r?.total ?? 0n,
    cantidad: Number(r?.cantidad ?? 0n),
    ticketPromedio: r?.ticket_promedio ?? 0n,
    ivaTotal: r?.iva_total ?? 0n,
  };
}

export async function ventasPorDia(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<{ fecha: Date; total: bigint; cantidad: bigint }[]>`
    SELECT
      DATE_TRUNC('day', c."fecha_emision" AT TIME ZONE 'America/Asuncion')::date AS fecha,
      COALESCE(SUM(c."total"), 0)::bigint AS total,
      COUNT(*)::bigint AS cantidad
    FROM comprobante c
    WHERE
      c."empresa_id" = ${user.empresaId}
      AND c."estado" = 'EMITIDO'
      AND c."deleted_at" IS NULL
      AND c."fecha_emision" >= ${q.desde}
      AND c."fecha_emision" <= ${q.hasta}
      ${sucursalFragment(sucursalId)}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
}

export async function ventasPorHora(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<{ dia_semana: number; hora: number; cantidad: bigint; total: bigint }[]>`
    SELECT
      EXTRACT(DOW FROM c."fecha_emision" AT TIME ZONE 'America/Asuncion')::int AS dia_semana,
      EXTRACT(HOUR FROM c."fecha_emision" AT TIME ZONE 'America/Asuncion')::int AS hora,
      COUNT(*)::bigint AS cantidad,
      COALESCE(SUM(c."total"), 0)::bigint AS total
    FROM comprobante c
    WHERE
      c."empresa_id" = ${user.empresaId}
      AND c."estado" = 'EMITIDO'
      AND c."deleted_at" IS NULL
      AND c."fecha_emision" >= ${q.desde}
      AND c."fecha_emision" <= ${q.hasta}
      ${sucursalFragment(sucursalId)}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PRODUCTOS Y CLIENTES
// ═══════════════════════════════════════════════════════════════════════════

export async function topProductos(user: UserCtx, q: TopQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    { producto_id: string | null; nombre: string; cantidad_total: bigint; ingreso_total: bigint }[]
  >`
    SELECT
      ic."producto_venta_id" AS producto_id,
      COALESCE(pv."nombre", ic."descripcion") AS nombre,
      SUM(ic."cantidad")::bigint AS cantidad_total,
      SUM(ic."subtotal")::bigint AS ingreso_total
    FROM item_comprobante ic
    JOIN comprobante c ON c.id = ic."comprobante_id"
    LEFT JOIN producto_venta pv ON pv.id = ic."producto_venta_id"
    WHERE
      c."empresa_id" = ${user.empresaId}
      AND c."estado" = 'EMITIDO'
      AND c."deleted_at" IS NULL
      AND c."fecha_emision" >= ${q.desde}
      AND c."fecha_emision" <= ${q.hasta}
      ${sucursalFragment(sucursalId)}
    GROUP BY 1, 2
    ORDER BY ingreso_total DESC
    LIMIT ${q.limite}
  `;
}

/**
 * Rentabilidad por producto en el rango: ingreso, costo y ganancia.
 *
 * El costo viene de `ItemComprobante.costoUnitarioSnapshot`, que se calcula al
 * emitir cada comprobante expandiendo la receta contra los costos de insumos
 * vigentes en ese momento. Para comprobantes anteriores a esta funcionalidad
 * el snapshot es 0, lo que sobrestima la ganancia — el filtro por fecha
 * permite acotar al período en que el snapshot ya está vivo.
 *
 * `ordenarPor`:
 *  - `ganancia` (default): mejor para ver "qué productos generan más plata
 *    en términos absolutos". Un producto barato vendido mucho puede ganar
 *    a uno caro vendido poco.
 *  - `margen`: porcentaje de ganancia sobre ingreso. Útil para detectar
 *    productos premium o con buena estructura de costo.
 */
export async function productosRentabilidad(user: UserCtx, q: RentabilidadQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  const orderBy =
    q.ordenarPor === 'margen'
      ? Prisma.sql`ORDER BY margen_porcentaje DESC NULLS LAST`
      : Prisma.sql`ORDER BY ganancia_total DESC`;

  return prisma.$queryRaw<
    {
      producto_id: string | null;
      nombre: string;
      cantidad_total: bigint;
      ingreso_total: bigint;
      costo_total: bigint;
      ganancia_total: bigint;
      margen_porcentaje: number | null;
    }[]
  >`
    SELECT
      ic."producto_venta_id" AS producto_id,
      COALESCE(pv."nombre", ic."descripcion") AS nombre,
      SUM(ic."cantidad")::bigint AS cantidad_total,
      SUM(ic."subtotal")::bigint AS ingreso_total,
      SUM(ic."cantidad" * ic."costo_unitario_snapshot")::bigint AS costo_total,
      (SUM(ic."subtotal") - SUM(ic."cantidad" * ic."costo_unitario_snapshot"))::bigint AS ganancia_total,
      CASE WHEN SUM(ic."subtotal") > 0 THEN
        ROUND(
          100.0 * (SUM(ic."subtotal") - SUM(ic."cantidad" * ic."costo_unitario_snapshot"))::numeric
          / SUM(ic."subtotal"),
          2
        )::float
      ELSE NULL END AS margen_porcentaje
    FROM item_comprobante ic
    JOIN comprobante c ON c.id = ic."comprobante_id"
    LEFT JOIN producto_venta pv ON pv.id = ic."producto_venta_id"
    WHERE
      c."empresa_id" = ${user.empresaId}
      AND c."estado" = 'EMITIDO'
      AND c."deleted_at" IS NULL
      AND c."fecha_emision" >= ${q.desde}
      AND c."fecha_emision" <= ${q.hasta}
      ${sucursalFragment(sucursalId)}
    GROUP BY 1, 2
    ${orderBy}
    LIMIT ${q.limite}
  `;
}

export async function topClientes(user: UserCtx, q: TopQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    {
      cliente_id: string;
      razon_social: string;
      ruc: string | null;
      dv: string | null;
      cantidad_compras: bigint;
      total_gastado: bigint;
    }[]
  >`
    SELECT
      cl."id" AS cliente_id,
      cl."razon_social",
      cl."ruc",
      cl."dv",
      COUNT(*)::bigint AS cantidad_compras,
      SUM(c."total")::bigint AS total_gastado
    FROM comprobante c
    JOIN cliente cl ON cl.id = c."cliente_id"
    WHERE
      c."empresa_id" = ${user.empresaId}
      AND c."estado" = 'EMITIDO'
      AND c."deleted_at" IS NULL
      AND cl."es_consumidor_final" = false
      AND c."fecha_emision" >= ${q.desde}
      AND c."fecha_emision" <= ${q.hasta}
      ${sucursalFragment(sucursalId)}
    GROUP BY 1, 2, 3, 4
    ORDER BY total_gastado DESC
    LIMIT ${q.limite}
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MÉTODOS DE PAGO
// ═══════════════════════════════════════════════════════════════════════════

export async function metodosPago(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<{ metodo: string; cantidad: bigint; total: bigint }[]>`
    SELECT
      pc."metodo",
      COUNT(*)::bigint AS cantidad,
      SUM(pc."monto")::bigint AS total
    FROM pago_comprobante pc
    JOIN comprobante c ON c.id = pc."comprobante_id"
    WHERE
      c."empresa_id" = ${user.empresaId}
      AND c."estado" = 'EMITIDO'
      AND c."deleted_at" IS NULL
      AND c."fecha_emision" >= ${q.desde}
      AND c."fecha_emision" <= ${q.hasta}
      ${sucursalFragment(sucursalId)}
    GROUP BY 1
    ORDER BY total DESC
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  COMPARATIVA SUCURSALES (sólo admin de empresa)
// ═══════════════════════════════════════════════════════════════════════════

export async function comparativaSucursales(user: UserCtx, q: RangoFechasQuery) {
  return prisma.$queryRaw<
    {
      sucursal_id: string;
      nombre: string;
      establecimiento: string;
      cantidad: bigint;
      total: bigint;
      ticket_promedio: bigint;
    }[]
  >`
    SELECT
      s."id" AS sucursal_id,
      s."nombre",
      s."establecimiento",
      COUNT(c.id)::bigint AS cantidad,
      COALESCE(SUM(c."total"), 0)::bigint AS total,
      COALESCE(AVG(c."total"), 0)::bigint AS ticket_promedio
    FROM sucursal s
    LEFT JOIN comprobante c
      ON c."sucursal_id" = s.id
      AND c."estado" = 'EMITIDO'
      AND c."deleted_at" IS NULL
      AND c."fecha_emision" >= ${q.desde}
      AND c."fecha_emision" <= ${q.hasta}
    WHERE s."empresa_id" = ${user.empresaId} AND s."deleted_at" IS NULL
    GROUP BY 1, 2, 3
    ORDER BY total DESC
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  INVENTARIO
// ═══════════════════════════════════════════════════════════════════════════

export async function stockBajo(user: UserCtx, q: StockQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  const sucFrag = sucursalId ? Prisma.sql`AND ss."sucursal_id" = ${sucursalId}` : Prisma.empty;

  return prisma.$queryRaw<
    {
      insumo_id: string;
      codigo: string | null;
      nombre: string;
      unidad_medida: string;
      stock_actual: Prisma.Decimal;
      stock_minimo: Prisma.Decimal;
      sucursal_id: string;
      sucursal_nombre: string;
    }[]
  >`
    SELECT
      pi."id" AS insumo_id,
      pi."codigo",
      pi."nombre",
      pi."unidad_medida",
      ss."stock_actual",
      ss."stock_minimo",
      s."id" AS sucursal_id,
      s."nombre" AS sucursal_nombre
    FROM stock_sucursal ss
    JOIN producto_inventario pi ON pi.id = ss."producto_inventario_id"
    JOIN sucursal s ON s.id = ss."sucursal_id"
    WHERE
      pi."empresa_id" = ${user.empresaId}
      AND pi."deleted_at" IS NULL
      AND ss."stock_minimo" > 0
      AND ss."stock_actual" <= ss."stock_minimo"
      ${sucFrag}
    ORDER BY (ss."stock_actual" / NULLIF(ss."stock_minimo", 0)) ASC, pi."nombre"
    LIMIT 100
  `;
}

export async function valuacionInventario(user: UserCtx, q: StockQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  const sucFrag = sucursalId ? Prisma.sql`AND ss."sucursal_id" = ${sucursalId}` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    {
      insumo_id: string;
      codigo: string | null;
      nombre: string;
      unidad_medida: string;
      stock_total: Prisma.Decimal;
      costo_unitario: bigint;
      valor_total: bigint;
    }[]
  >`
    SELECT
      pi."id" AS insumo_id,
      pi."codigo",
      pi."nombre",
      pi."unidad_medida",
      SUM(ss."stock_actual")::numeric AS stock_total,
      pi."costo_unitario",
      (SUM(ss."stock_actual") * pi."costo_unitario")::bigint AS valor_total
    FROM stock_sucursal ss
    JOIN producto_inventario pi ON pi.id = ss."producto_inventario_id"
    WHERE
      pi."empresa_id" = ${user.empresaId}
      AND pi."deleted_at" IS NULL
      ${sucFrag}
    GROUP BY 1, 2, 3, 4, pi."costo_unitario"
    ORDER BY valor_total DESC
  `;

  const totalGeneral = rows.reduce((acc, r) => acc + r.valor_total, 0n);
  return { items: rows, totalGeneral };
}

// ═══════════════════════════════════════════════════════════════════════════
//  DASHBOARD — endpoint compuesto para la landing del admin
// ═══════════════════════════════════════════════════════════════════════════

export async function dashboardSnapshot(user: UserCtx, sucursalIdInput?: string) {
  const sucursalId = efectiveSucursalId(user, sucursalIdInput);

  const ahora = new Date();
  const inicioHoy = new Date(ahora);
  inicioHoy.setHours(0, 0, 0, 0);
  const inicioAyer = new Date(inicioHoy);
  inicioAyer.setDate(inicioAyer.getDate() - 1);
  const inicioSemana = new Date(inicioHoy);
  inicioSemana.setDate(inicioSemana.getDate() - 6);
  const inicioMes = new Date(inicioHoy);
  inicioMes.setDate(inicioMes.getDate() - 29);

  const [hoy, ayer, semana, ventasUltimos30, top5, alertas] = await Promise.all([
    resumenVentas(user, { desde: inicioHoy, hasta: ahora, sucursalId }),
    resumenVentas(user, { desde: inicioAyer, hasta: inicioHoy, sucursalId }),
    resumenVentas(user, { desde: inicioSemana, hasta: ahora, sucursalId }),
    ventasPorDia(user, { desde: inicioMes, hasta: ahora, sucursalId }),
    topProductos(user, { desde: inicioSemana, hasta: ahora, sucursalId, limite: 5 }),
    stockBajo(user, { sucursalId }),
  ]);

  return {
    hoy,
    ayer,
    semana,
    ventasUltimos30,
    topProductosSemana: top5,
    alertasStock: alertas.slice(0, 10),
    alertasStockTotal: alertas.length,
  };
}
