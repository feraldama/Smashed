import { Prisma } from '@prisma/client';

import { prisma } from '../../lib/prisma.js';

import type {
  DescuentosListadoQuery,
  MovimientosStockQuery,
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

/**
 * Filtra por usuario. Como cada reporte interpreta "usuario" distinto (quien
 * cobró el comprobante, quien aplicó el descuento, quien tomó el pedido),
 * el caller pasa alias + columna.
 */
function usuarioFragment(usuarioId: string | undefined, alias: string, column: string) {
  return usuarioId
    ? Prisma.sql`AND ${Prisma.raw(`"${alias}"`)}.${Prisma.raw(`"${column}"`)} = ${usuarioId}`
    : Prisma.empty;
}

// Sólo documentos de venta. Las notas de crédito/débito (devoluciones, ajustes)
// no son ventas: si algún día se emiten, NO deben sumar como ingreso/ganancia
// acá. Restar las devoluciones es un trabajo aparte, cuando exista ese flujo.
// (Hoy `emitirComprobante` ya sólo deja emitir TICKET/FACTURA; esto es defensa
// en profundidad por si entran otros tipos directo a la BD o por flujos futuros.)
const soloVentas = Prisma.sql`AND c."tipo_documento" IN ('TICKET', 'FACTURA')`;

// ═══════════════════════════════════════════════════════════════════════════
//  VENTAS
// ═══════════════════════════════════════════════════════════════════════════

export async function resumenVentas(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  // Joineamos con pedido para sumar descuentos y recargo delivery —
  // datos que viven en pedido, no en comprobante. El comprobante.total ya
  // refleja ambos (es el final cobrado), por eso ticket_promedio sale del total.
  const rows = await prisma.$queryRaw<
    {
      total: bigint | null;
      cantidad: bigint | null;
      ticket_promedio: bigint | null;
      iva_total: bigint | null;
      total_descuentos: bigint | null;
      total_recargo_delivery: bigint | null;
    }[]
  >`
    SELECT
      COALESCE(SUM(c."total"), 0)::bigint AS total,
      COUNT(*)::bigint AS cantidad,
      COALESCE(AVG(c."total"), 0)::bigint AS ticket_promedio,
      COALESCE(SUM(c."total_iva_10") + SUM(c."total_iva_5"), 0)::bigint AS iva_total,
      COALESCE(SUM(p."total_descuento"), 0)::bigint AS total_descuentos,
      COALESCE(SUM(p."recargo_delivery"), 0)::bigint AS total_recargo_delivery
    FROM comprobante c
    LEFT JOIN pedido p ON p.id = c."pedido_id"
    WHERE
      c."empresa_id" = ${user.empresaId}
      AND c."estado" = 'EMITIDO'
      AND c."deleted_at" IS NULL
      ${soloVentas}
      AND c."fecha_emision" >= ${q.desde}
      AND c."fecha_emision" <= ${q.hasta}
      ${sucursalFragment(sucursalId)}
      ${usuarioFragment(q.usuarioId, 'c', 'emitido_por_id')}
  `;

  const r = rows[0];
  return {
    total: r?.total ?? 0n,
    cantidad: Number(r?.cantidad ?? 0n),
    ticketPromedio: r?.ticket_promedio ?? 0n,
    ivaTotal: r?.iva_total ?? 0n,
    totalDescuentos: r?.total_descuentos ?? 0n,
    totalRecargoDelivery: r?.total_recargo_delivery ?? 0n,
  };
}

export async function ventasPorDia(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    {
      fecha: Date;
      total: bigint;
      cantidad: bigint;
      ticket_promedio: bigint;
      total_descuentos: bigint;
      total_recargo_delivery: bigint;
    }[]
  >`
    SELECT
      DATE_TRUNC('day', c."fecha_emision" AT TIME ZONE 'America/Asuncion')::date AS fecha,
      COALESCE(SUM(c."total"), 0)::bigint AS total,
      COUNT(*)::bigint AS cantidad,
      COALESCE(AVG(c."total"), 0)::bigint AS ticket_promedio,
      COALESCE(SUM(p."total_descuento"), 0)::bigint AS total_descuentos,
      COALESCE(SUM(p."recargo_delivery"), 0)::bigint AS total_recargo_delivery
    FROM comprobante c
    LEFT JOIN pedido p ON p.id = c."pedido_id"
    WHERE
      c."empresa_id" = ${user.empresaId}
      AND c."estado" = 'EMITIDO'
      AND c."deleted_at" IS NULL
      ${soloVentas}
      AND c."fecha_emision" >= ${q.desde}
      AND c."fecha_emision" <= ${q.hasta}
      ${sucursalFragment(sucursalId)}
      ${usuarioFragment(q.usuarioId, 'c', 'emitido_por_id')}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
}

export async function ventasPorHora(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    {
      dia_semana: number;
      hora: number;
      cantidad: bigint;
      total: bigint;
      ticket_promedio: bigint;
    }[]
  >`
    SELECT
      EXTRACT(DOW FROM c."fecha_emision" AT TIME ZONE 'America/Asuncion')::int AS dia_semana,
      EXTRACT(HOUR FROM c."fecha_emision" AT TIME ZONE 'America/Asuncion')::int AS hora,
      COUNT(*)::bigint AS cantidad,
      COALESCE(SUM(c."total"), 0)::bigint AS total,
      COALESCE(AVG(c."total"), 0)::bigint AS ticket_promedio
    FROM comprobante c
    WHERE
      c."empresa_id" = ${user.empresaId}
      AND c."estado" = 'EMITIDO'
      AND c."deleted_at" IS NULL
      ${soloVentas}
      AND c."fecha_emision" >= ${q.desde}
      AND c."fecha_emision" <= ${q.hasta}
      ${sucursalFragment(sucursalId)}
      ${usuarioFragment(q.usuarioId, 'c', 'emitido_por_id')}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PRODUCTOS Y CLIENTES
// ═══════════════════════════════════════════════════════════════════════════

export async function topProductos(user: UserCtx, q: TopQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  // Mismo filtro de "venta real" para ambas fuentes (líneas del comprobante y
  // componentes de combo). Se embebe dos veces; Prisma reutiliza los params.
  const ventasWhere = Prisma.sql`
    c."empresa_id" = ${user.empresaId}
    AND c."estado" = 'EMITIDO'
    AND c."deleted_at" IS NULL
    ${soloVentas}
    AND c."fecha_emision" >= ${q.desde}
    AND c."fecha_emision" <= ${q.hasta}
    ${sucursalFragment(sucursalId)}
  `;

  // Un combo se factura como una sola línea (el producto combo, con su precio
  // completo). Sus componentes elegidos (la Smash Kesu del combo, etc.) viven
  // sólo en item_pedido_combo_opcion. Para que esos componentes se reflejen en
  // "productos más pedidos" unimos dos fuentes:
  //   1. líneas del comprobante tal cual (incluye la propia línea del combo,
  //      que conserva su ingreso completo).
  //   2. cada selección de combo, sumando SÓLO unidades (ingreso 0) — así no se
  //      duplica plata: el precio del combo ya está en su línea de la fuente 1.
  // La cantidad del componente es la cantidad del item de pedido (un combo con
  // cantidad 2 aporta 2 a cada componente elegido).
  return prisma.$queryRaw<
    { producto_id: string | null; nombre: string; cantidad_total: bigint; ingreso_total: bigint }[]
  >`
    SELECT
      u.producto_id,
      u.nombre,
      SUM(u.cantidad)::bigint AS cantidad_total,
      SUM(u.ingreso)::bigint AS ingreso_total
    FROM (
      SELECT
        ic."producto_venta_id" AS producto_id,
        COALESCE(pv."nombre", ic."descripcion") AS nombre,
        ic."cantidad" AS cantidad,
        ic."subtotal" AS ingreso
      FROM item_comprobante ic
      JOIN comprobante c ON c.id = ic."comprobante_id"
      LEFT JOIN producto_venta pv ON pv.id = ic."producto_venta_id"
      WHERE ${ventasWhere}

      UNION ALL

      SELECT
        op_pv."id" AS producto_id,
        op_pv."nombre" AS nombre,
        ip."cantidad" AS cantidad,
        0::bigint AS ingreso
      FROM comprobante c
      JOIN pedido p ON p.id = c."pedido_id"
      JOIN item_pedido ip ON ip."pedido_id" = p.id
      JOIN item_pedido_combo_opcion ipco ON ipco."item_pedido_id" = ip.id
      JOIN combo_grupo_opcion cgo ON cgo.id = ipco."combo_grupo_opcion_id"
      JOIN producto_venta op_pv ON op_pv.id = cgo."producto_venta_id"
      WHERE ${ventasWhere}
    ) u
    GROUP BY u.producto_id, u.nombre
    ORDER BY ingreso_total DESC, cantidad_total DESC
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
      ${soloVentas}
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
      ${soloVentas}
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
      ${soloVentas}
      AND c."fecha_emision" >= ${q.desde}
      AND c."fecha_emision" <= ${q.hasta}
      ${sucursalFragment(sucursalId)}
      ${usuarioFragment(q.usuarioId, 'c', 'emitido_por_id')}
    GROUP BY 1
    ORDER BY total DESC
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  VENTAS POR CANAL (tipo de pedido)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Agrega ventas por tipo de pedido — MOSTRADOR, MESA, DELIVERY_PROPIO, etc.
 * Usa el JOIN con pedido para tomar `pedido.tipo`. Pedidos sin comprobante
 * emitido no cuentan (es venta real, no intención).
 */
export async function ventasPorCanal(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    {
      tipo: string;
      cantidad: bigint;
      total: bigint;
      ticket_promedio: bigint;
      total_descuentos: bigint;
    }[]
  >`
    SELECT
      p."tipo",
      COUNT(c.id)::bigint AS cantidad,
      COALESCE(SUM(c."total"), 0)::bigint AS total,
      COALESCE(AVG(c."total"), 0)::bigint AS ticket_promedio,
      COALESCE(SUM(p."total_descuento"), 0)::bigint AS total_descuentos
    FROM comprobante c
    JOIN pedido p ON p.id = c."pedido_id"
    WHERE
      c."empresa_id" = ${user.empresaId}
      AND c."estado" = 'EMITIDO'
      AND c."deleted_at" IS NULL
      ${soloVentas}
      AND c."fecha_emision" >= ${q.desde}
      AND c."fecha_emision" <= ${q.hasta}
      ${sucursalFragment(sucursalId)}
      ${usuarioFragment(q.usuarioId, 'c', 'emitido_por_id')}
    GROUP BY 1
    ORDER BY total DESC
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DESCUENTOS APLICADOS — listado detallado
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Listado fila-por-pedido de descuentos aplicados en el rango. A diferencia del
 * cierre Z (que agrega por turno), este es el detalle crudo: cada descuento con
 * quién lo aplicó, quién lo autorizó, motivo, monto, hora, observación.
 *
 * Filtra por sucursal (efectivo), motivo, tipo de descuento, y usuario que
 * APLICÓ el descuento (no quien autorizó).
 *
 * Devuelve hasta `limite` filas ordenadas por fecha descendente.
 */
export async function descuentosListado(user: UserCtx, q: DescuentosListadoQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    {
      pedido_id: string;
      numero: number;
      tipo: string;
      monto: bigint;
      observacion: string | null;
      aplicado_en: Date;
      motivo: string | null;
      aplicado_por: string | null;
      autorizado_por: string | null;
      empleado_beneficiario: string | null;
      comprobante_id: string | null;
      comprobante_numero: string | null;
      tipo_pedido: string;
      sucursal_nombre: string;
    }[]
  >`
    SELECT
      p.id AS pedido_id,
      p."numero",
      p."descuento_tipo" AS tipo,
      p."total_descuento" AS monto,
      p."descuento_observacion" AS observacion,
      p."updated_at" AS aplicado_en,
      md."nombre" AS motivo,
      ua."nombre_completo" AS aplicado_por,
      uz."nombre_completo" AS autorizado_por,
      eb."nombre_completo" AS empleado_beneficiario,
      cmp.id AS comprobante_id,
      cmp."numero_documento" AS comprobante_numero,
      p."tipo" AS tipo_pedido,
      s."nombre" AS sucursal_nombre
    FROM pedido p
    LEFT JOIN motivo_descuento md ON md.id = p."motivo_descuento_id"
    LEFT JOIN usuario ua ON ua.id = p."descuento_aplicado_por_id"
    LEFT JOIN usuario uz ON uz.id = p."descuento_autorizado_por_id"
    LEFT JOIN usuario eb ON eb.id = p."empleado_beneficiario_id"
    LEFT JOIN sucursal s ON s.id = p."sucursal_id"
    -- Ticket de venta del pedido: tomamos el comprobante de venta emitido más
    -- reciente (un pedido puede tener varios si hubo reemisión / nota de crédito).
    LEFT JOIN LATERAL (
      SELECT cc.id, cc."numero_documento"
      FROM comprobante cc
      WHERE cc."pedido_id" = p.id
        AND cc."estado" = 'EMITIDO'
        AND cc."deleted_at" IS NULL
        AND cc."tipo_documento" IN ('TICKET', 'FACTURA')
      ORDER BY cc."fecha_emision" DESC
      LIMIT 1
    ) cmp ON true
    WHERE
      p."empresa_id" = ${user.empresaId}
      AND p."deleted_at" IS NULL
      AND p."total_descuento" > 0
      AND p."updated_at" >= ${q.desde}
      AND p."updated_at" <= ${q.hasta}
      ${sucursalId ? Prisma.sql`AND p."sucursal_id" = ${sucursalId}` : Prisma.empty}
      ${q.usuarioId ? Prisma.sql`AND p."descuento_aplicado_por_id" = ${q.usuarioId}` : Prisma.empty}
      ${q.motivoDescuentoId ? Prisma.sql`AND p."motivo_descuento_id" = ${q.motivoDescuentoId}` : Prisma.empty}
      ${q.tipo ? Prisma.sql`AND p."descuento_tipo" = ${q.tipo}::"TipoDescuento"` : Prisma.empty}
    ORDER BY p."updated_at" DESC
    LIMIT ${q.limite}
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROMOCIONES — ahorro y veces aplicada por promo
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Agrega el ahorro generado por cada promoción en el rango: cuántos pedidos la
 * usaron, cuántas unidades se vendieron en promo, monto total que el cliente
 * ahorró (suma de `item_pedido.descuento_promocion`) y el monto realmente
 * cobrado por los items en promo. Excluye pedidos CANCELADO.
 *
 * Útil para responder "¿cuánto nos costó cada promoción?" y comparar contra
 * el incremento de ventas que generó.
 */
export async function promocionesAhorro(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    {
      promocion_id: string;
      nombre: string;
      tipo: string;
      activo: boolean;
      pedidos: bigint;
      unidades: bigint;
      ahorro_total: bigint;
      cobrado_total: bigint;
    }[]
  >`
    SELECT
      pr.id AS promocion_id,
      pr."nombre",
      pr."tipo"::text AS tipo,
      pr."activo",
      COUNT(DISTINCT ip."pedido_id")::bigint AS pedidos,
      COALESCE(SUM(ip."cantidad"), 0)::bigint AS unidades,
      COALESCE(SUM(ip."descuento_promocion"), 0)::bigint AS ahorro_total,
      COALESCE(SUM(ip."subtotal"), 0)::bigint AS cobrado_total
    FROM item_pedido ip
    INNER JOIN promocion pr ON pr.id = ip."promocion_id"
    INNER JOIN pedido p ON p.id = ip."pedido_id"
    WHERE
      pr."empresa_id" = ${user.empresaId}
      AND p."deleted_at" IS NULL
      AND p."estado" <> 'CANCELADO'::"EstadoPedido"
      AND p."created_at" >= ${q.desde}
      AND p."created_at" <= ${q.hasta}
      ${sucursalId ? Prisma.sql`AND p."sucursal_id" = ${sucursalId}` : Prisma.empty}
    GROUP BY pr.id, pr."nombre", pr."tipo", pr."activo"
    ORDER BY ahorro_total DESC
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  COMBOS — qué se pide dentro de cada combo
// ═══════════════════════════════════════════════════════════════════════════

// Filtro común de los reportes de combos: pedidos no cancelados del rango.
// Igual que promociones, medimos sobre `pedido` (no comprobante) porque la
// selección de combo vive en item_pedido, y usamos `created_at` para el rango.
// `SUM(ip.cantidad)` cuenta unidades de combo (un item con cantidad=2 son 2
// combos), no filas de selección.
function combosWhere(empresaId: string, q: RangoFechasQuery, sucursalId: string | undefined) {
  return Prisma.sql`
    p."empresa_id" = ${empresaId}
    AND p."deleted_at" IS NULL
    AND p."estado" <> 'CANCELADO'::"EstadoPedido"
    AND p."created_at" >= ${q.desde}
    AND p."created_at" <= ${q.hasta}
    ${sucursalId ? Prisma.sql`AND p."sucursal_id" = ${sucursalId}` : Prisma.empty}
  `;
}

/**
 * Por cada combo y cada grupo de elección (Bebida, Acompañamiento…), cuántas
 * veces se eligió cada opción. Responde "en el Combo X la bebida más pedida es
 * Coca". El % dentro del grupo lo calcula el front (veces / total del grupo).
 *
 * No filtra grupos/opciones soft-deleted: la selección histórica del pedido
 * sigue siendo válida aunque hoy el combo haya cambiado de composición.
 */
export async function combosOpciones(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    {
      combo_id: string;
      combo_nombre: string;
      grupo_id: string;
      grupo_nombre: string;
      grupo_orden: number;
      opcion_producto_id: string;
      opcion_nombre: string;
      veces: bigint;
    }[]
  >`
    SELECT
      cb_pv."id" AS combo_id,
      cb_pv."nombre" AS combo_nombre,
      cg."id" AS grupo_id,
      cg."nombre" AS grupo_nombre,
      cg."orden" AS grupo_orden,
      op_pv."id" AS opcion_producto_id,
      op_pv."nombre" AS opcion_nombre,
      SUM(ip."cantidad")::bigint AS veces
    FROM item_pedido_combo_opcion ipco
    JOIN item_pedido ip ON ip.id = ipco."item_pedido_id"
    JOIN pedido p ON p.id = ip."pedido_id"
    JOIN combo_grupo cg ON cg.id = ipco."combo_grupo_id"
    JOIN combo cb ON cb.id = cg."combo_id"
    JOIN producto_venta cb_pv ON cb_pv.id = cb."producto_venta_id"
    JOIN combo_grupo_opcion cgo ON cgo.id = ipco."combo_grupo_opcion_id"
    JOIN producto_venta op_pv ON op_pv.id = cgo."producto_venta_id"
    WHERE ${combosWhere(user.empresaId, q, sucursalId)}
    GROUP BY 1, 2, 3, 4, 5, 6, 7
    ORDER BY combo_nombre ASC, grupo_orden ASC, grupo_nombre ASC, veces DESC
  `;
}

/**
 * Ranking de la canasta exacta por combo: el conjunto de opciones elegidas
 * juntas en un mismo item de pedido. Responde "la combinación más pedida del
 * Combo X es Papas + Coca". `combinacion` concatena las opciones ordenadas por
 * el orden del grupo para que la misma canasta agrupe siempre igual.
 */
export async function combosCombinaciones(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    {
      combo_id: string;
      combo_nombre: string;
      combinacion: string;
      veces: bigint;
    }[]
  >`
    WITH item_combo AS (
      SELECT
        ip.id AS item_id,
        ip."cantidad" AS cantidad,
        cb_pv."id" AS combo_id,
        cb_pv."nombre" AS combo_nombre,
        STRING_AGG(op_pv."nombre", ' + ' ORDER BY cg."orden", cg."nombre") AS combinacion
      FROM item_pedido_combo_opcion ipco
      JOIN item_pedido ip ON ip.id = ipco."item_pedido_id"
      JOIN pedido p ON p.id = ip."pedido_id"
      JOIN combo_grupo cg ON cg.id = ipco."combo_grupo_id"
      JOIN combo cb ON cb.id = cg."combo_id"
      JOIN producto_venta cb_pv ON cb_pv.id = cb."producto_venta_id"
      JOIN combo_grupo_opcion cgo ON cgo.id = ipco."combo_grupo_opcion_id"
      JOIN producto_venta op_pv ON op_pv.id = cgo."producto_venta_id"
      WHERE ${combosWhere(user.empresaId, q, sucursalId)}
      GROUP BY ip.id, ip."cantidad", cb_pv."id", cb_pv."nombre"
    )
    SELECT
      combo_id,
      combo_nombre,
      combinacion,
      SUM(cantidad)::bigint AS veces
    FROM item_combo
    GROUP BY combo_id, combo_nombre, combinacion
    ORDER BY combo_nombre ASC, veces DESC
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DESCUENTOS POR EMPLEADO — agregación por beneficiario
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Agrupa los descuentos del rango por empleado beneficiario. Solo cuenta
 * pedidos con `empleado_beneficiario_id` no nulo y `total_descuento > 0`
 * (descarta descuentos removidos). Excluye pedidos CANCELADO.
 *
 * Usa `created_at` del pedido para el rango — coherente con cómo se mide el
 * tope "1 descuento empleado por día por empleado".
 *
 * Retorna por empleado: cantidad de ventas, total descontado, base original
 * (subtotal + IVA) y total cobrado neto.
 */
export async function descuentosPorEmpleado(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    {
      empleado_id: string;
      empleado_nombre: string;
      empleado_rol: string;
      cantidad_ventas: bigint;
      total_descontado: bigint;
      base_original: bigint;
      total_cobrado: bigint;
      // Detalle fila-por-pedido para drill-down: cada descuento con su ticket.
      tickets: {
        pedido_id: string;
        numero: number;
        fecha: string;
        monto: string;
        comprobante_id: string | null;
        comprobante_numero: string | null;
      }[];
    }[]
  >`
    SELECT
      u.id AS empleado_id,
      u."nombre_completo" AS empleado_nombre,
      u."rol"::text AS empleado_rol,
      COUNT(*)::bigint AS cantidad_ventas,
      COALESCE(SUM(p."total_descuento"), 0)::bigint AS total_descontado,
      COALESCE(SUM(p."subtotal" + p."total_iva"), 0)::bigint AS base_original,
      COALESCE(SUM(p."total"), 0)::bigint AS total_cobrado,
      json_agg(
        json_build_object(
          'pedido_id', p.id,
          'numero', p."numero",
          'fecha', p."created_at",
          'monto', p."total_descuento"::text,
          'comprobante_id', cmp.id,
          'comprobante_numero', cmp."numero_documento"
        ) ORDER BY p."created_at" DESC
      ) AS tickets
    FROM pedido p
    INNER JOIN usuario u ON u.id = p."empleado_beneficiario_id"
    -- Ticket de venta del pedido: comprobante de venta emitido más reciente.
    LEFT JOIN LATERAL (
      SELECT cc.id, cc."numero_documento"
      FROM comprobante cc
      WHERE cc."pedido_id" = p.id
        AND cc."estado" = 'EMITIDO'
        AND cc."deleted_at" IS NULL
        AND cc."tipo_documento" IN ('TICKET', 'FACTURA')
      ORDER BY cc."fecha_emision" DESC
      LIMIT 1
    ) cmp ON true
    WHERE
      p."empresa_id" = ${user.empresaId}
      AND p."deleted_at" IS NULL
      AND p."empleado_beneficiario_id" IS NOT NULL
      AND p."total_descuento" > 0
      AND p."estado" <> 'CANCELADO'::"EstadoPedido"
      AND p."created_at" >= ${q.desde}
      AND p."created_at" <= ${q.hasta}
      ${sucursalId ? Prisma.sql`AND p."sucursal_id" = ${sucursalId}` : Prisma.empty}
      ${q.usuarioId ? Prisma.sql`AND p."empleado_beneficiario_id" = ${q.usuarioId}` : Prisma.empty}
    GROUP BY u.id, u."nombre_completo", u."rol"
    ORDER BY total_descontado DESC
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TIEMPOS DE COCINA — promedios + percentiles
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Devuelve métricas de tiempos del flujo de cocina por sucursal:
 *  - tiempoPrepSegundos: del confirmado al listo (cocina trabajando)
 *  - tiempoEsperaClienteSegundos: del confirmado al entregado (espera total
 *    desde la perspectiva del cliente)
 *
 * Para cada métrica devuelve promedio, mediana (p50) y p90 — útil para
 * detectar que "en promedio sale en 8min pero el peor 10% tarda 25min".
 *
 * Filtra pedidos con ambos timestamps presentes (no parciales).
 */
export async function tiemposCocina(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    {
      sucursal_id: string;
      sucursal_nombre: string;
      cantidad: bigint;
      prep_promedio_seg: number;
      prep_p50_seg: number;
      prep_p90_seg: number;
      espera_promedio_seg: number;
      espera_p50_seg: number;
      espera_p90_seg: number;
    }[]
  >`
    SELECT
      s.id AS sucursal_id,
      s."nombre" AS sucursal_nombre,
      COUNT(*)::bigint AS cantidad,
      COALESCE(AVG(EXTRACT(EPOCH FROM (p."listo_en" - p."confirmado_en"))), 0)::float AS prep_promedio_seg,
      COALESCE(
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (p."listo_en" - p."confirmado_en"))),
        0
      )::float AS prep_p50_seg,
      COALESCE(
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (p."listo_en" - p."confirmado_en"))),
        0
      )::float AS prep_p90_seg,
      COALESCE(AVG(EXTRACT(EPOCH FROM (p."entregado_en" - p."confirmado_en"))), 0)::float AS espera_promedio_seg,
      COALESCE(
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (p."entregado_en" - p."confirmado_en"))),
        0
      )::float AS espera_p50_seg,
      COALESCE(
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (p."entregado_en" - p."confirmado_en"))),
        0
      )::float AS espera_p90_seg
    FROM pedido p
    JOIN sucursal s ON s.id = p."sucursal_id"
    WHERE
      p."empresa_id" = ${user.empresaId}
      AND p."deleted_at" IS NULL
      AND p."confirmado_en" IS NOT NULL
      AND p."listo_en" IS NOT NULL
      AND p."entregado_en" IS NOT NULL
      AND p."confirmado_en" >= ${q.desde}
      AND p."confirmado_en" <= ${q.hasta}
      ${sucursalId ? Prisma.sql`AND p."sucursal_id" = ${sucursalId}` : Prisma.empty}
      ${q.usuarioId ? Prisma.sql`AND p."tomado_por_id" = ${q.usuarioId}` : Prisma.empty}
    GROUP BY 1, 2
    ORDER BY 2
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  INVENTARIO — MOVIMIENTOS detallados + resumen por tipo
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Listado detallado de movimientos de stock — una fila por movimiento.
 *
 * Filtra por rango (sobre `created_at`), tipo de movimiento, insumo, sucursal,
 * usuario que ejecutó. Devuelve cantidad signada (positiva entrada, negativa
 * salida) para que el frontend pinte fácil con color.
 */
export async function movimientosStock(user: UserCtx, q: MovimientosStockQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    {
      id: string;
      fecha: Date;
      tipo: string;
      insumo_codigo: string | null;
      insumo_nombre: string;
      sucursal_nombre: string;
      usuario_nombre: string | null;
      cantidad_signed: Prisma.Decimal;
      unidad_medida: string;
      costo_unitario: bigint;
      motivo: string | null;
    }[]
  >`
    SELECT
      ms.id,
      ms."created_at" AS fecha,
      ms."tipo"::text AS tipo,
      pi."codigo" AS insumo_codigo,
      pi."nombre" AS insumo_nombre,
      s."nombre" AS sucursal_nombre,
      u."nombre_completo" AS usuario_nombre,
      ms."cantidad_signed",
      pi."unidad_medida"::text AS unidad_medida,
      ms."costo_unitario",
      ms."motivo"
    FROM movimiento_stock ms
    JOIN producto_inventario pi ON pi.id = ms."producto_inventario_id"
    JOIN sucursal s ON s.id = ms."sucursal_id"
    LEFT JOIN usuario u ON u.id = ms."usuario_id"
    WHERE
      pi."empresa_id" = ${user.empresaId}
      AND ms."created_at" >= ${q.desde}
      AND ms."created_at" <= ${q.hasta}
      ${sucursalId ? Prisma.sql`AND ms."sucursal_id" = ${sucursalId}` : Prisma.empty}
      ${q.usuarioId ? Prisma.sql`AND ms."usuario_id" = ${q.usuarioId}` : Prisma.empty}
      ${q.tipo ? Prisma.sql`AND ms."tipo" = ${q.tipo}::"TipoMovimientoStock"` : Prisma.empty}
      ${q.insumoId ? Prisma.sql`AND ms."producto_inventario_id" = ${q.insumoId}` : Prisma.empty}
    ORDER BY ms."created_at" DESC
    LIMIT ${q.limite}
  `;
}

/**
 * Resumen agregado de movimientos por tipo (cuánto entró, salió, mermó, etc.)
 * Una fila por (tipo, sucursal) con suma de cantidades y costo total estimado.
 *
 * Usado para mostrar de un vistazo "este mes perdimos X en mermas, Y en ajustes".
 */
export async function movimientosResumen(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    {
      tipo: string;
      sucursal_id: string;
      sucursal_nombre: string;
      cantidad_total: Prisma.Decimal;
      cantidad_movimientos: bigint;
      costo_estimado: bigint;
    }[]
  >`
    SELECT
      ms."tipo"::text AS tipo,
      s.id AS sucursal_id,
      s."nombre" AS sucursal_nombre,
      SUM(ABS(ms."cantidad_signed")) AS cantidad_total,
      COUNT(*)::bigint AS cantidad_movimientos,
      COALESCE(SUM(ABS(ms."cantidad_signed") * ms."costo_unitario"), 0)::bigint AS costo_estimado
    FROM movimiento_stock ms
    JOIN producto_inventario pi ON pi.id = ms."producto_inventario_id"
    JOIN sucursal s ON s.id = ms."sucursal_id"
    WHERE
      pi."empresa_id" = ${user.empresaId}
      AND ms."created_at" >= ${q.desde}
      AND ms."created_at" <= ${q.hasta}
      ${sucursalId ? Prisma.sql`AND ms."sucursal_id" = ${sucursalId}` : Prisma.empty}
      ${q.usuarioId ? Prisma.sql`AND ms."usuario_id" = ${q.usuarioId}` : Prisma.empty}
    GROUP BY 1, 2, 3
    ORDER BY 3, 1
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CAJA — REPORTE DIARIO (un row por turno = apertura → cierre)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Listado de turnos de caja con todas las cifras del cuadre:
 *  - monto inicial (apertura)
 *  - ventas + ingresos extra + egresos/gastos + retiros parciales (sumadas
 *    sólo de movimientos EFECTIVO — el resto va por método de pago)
 *  - total esperado vs contado vs diferencia
 *
 * Filtra por rango (sobre `cierre.cerrada_en`), sucursal y usuario que cerró.
 * Aperturas sin cierre todavía (turnos abiertos) no aparecen — el reporte es
 * de turnos cerrados.
 */
export async function cajaTurnos(user: UserCtx, q: RangoFechasQuery) {
  const sucursalId = efectiveSucursalId(user, q.sucursalId);
  return prisma.$queryRaw<
    {
      cierre_id: string;
      caja_nombre: string;
      sucursal_nombre: string;
      usuario_nombre: string;
      abierta_en: Date;
      cerrada_en: Date;
      monto_inicial: bigint;
      total_ventas: bigint;
      ingresos_extra_efectivo: bigint;
      egresos_efectivo: bigint;
      retiros_parciales: bigint;
      ventas_efectivo: bigint;
      total_esperado_efectivo: bigint;
      total_contado_efectivo: bigint;
      diferencia_efectivo: bigint;
    }[]
  >`
    SELECT
      cc.id AS cierre_id,
      ca."nombre" AS caja_nombre,
      s."nombre" AS sucursal_nombre,
      u."nombre_completo" AS usuario_nombre,
      ap."abierta_en" AS abierta_en,
      cc."cerrada_en" AS cerrada_en,
      ap."monto_inicial" AS monto_inicial,
      cc."total_ventas" AS total_ventas,
      COALESCE(SUM(CASE WHEN mc."tipo" = 'INGRESO_EXTRA' AND mc."metodo_pago" = 'EFECTIVO' THEN mc."monto" ELSE 0 END), 0)::bigint AS ingresos_extra_efectivo,
      COALESCE(SUM(CASE WHEN mc."tipo" = 'EGRESO' AND mc."metodo_pago" = 'EFECTIVO' THEN mc."monto" ELSE 0 END), 0)::bigint AS egresos_efectivo,
      COALESCE(SUM(CASE WHEN mc."tipo" = 'RETIRO_PARCIAL' AND mc."metodo_pago" = 'EFECTIVO' THEN mc."monto" ELSE 0 END), 0)::bigint AS retiros_parciales,
      COALESCE(SUM(CASE WHEN mc."tipo" = 'VENTA' AND mc."metodo_pago" = 'EFECTIVO' THEN mc."monto" ELSE 0 END), 0)::bigint AS ventas_efectivo,
      cc."total_esperado_efectivo" AS total_esperado_efectivo,
      cc."total_contado_efectivo" AS total_contado_efectivo,
      cc."diferencia_efectivo" AS diferencia_efectivo
    FROM cierre_caja cc
    JOIN apertura_caja ap ON ap.id = cc."apertura_caja_id"
    JOIN caja ca ON ca.id = cc."caja_id"
    JOIN sucursal s ON s.id = ca."sucursal_id"
    JOIN usuario u ON u.id = cc."usuario_id"
    LEFT JOIN movimiento_caja mc ON mc."apertura_caja_id" = ap.id
    WHERE
      s."empresa_id" = ${user.empresaId}
      AND cc."cerrada_en" >= ${q.desde}
      AND cc."cerrada_en" <= ${q.hasta}
      ${sucursalId ? Prisma.sql`AND ca."sucursal_id" = ${sucursalId}` : Prisma.empty}
      ${q.usuarioId ? Prisma.sql`AND cc."usuario_id" = ${q.usuarioId}` : Prisma.empty}
    GROUP BY cc.id, ca."nombre", s."nombre", u."nombre_completo", ap."abierta_en", cc."cerrada_en", ap."monto_inicial", cc."total_ventas", cc."total_esperado_efectivo", cc."total_contado_efectivo", cc."diferencia_efectivo"
    ORDER BY cc."cerrada_en" DESC
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
      ${soloVentas}
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

  const baseRango = { desde: inicioHoy, hasta: ahora, sucursalId, formato: 'json' as const };
  const [hoy, ayer, semana, ventasUltimos30, top5, alertas] = await Promise.all([
    resumenVentas(user, baseRango),
    resumenVentas(user, { ...baseRango, desde: inicioAyer, hasta: inicioHoy }),
    resumenVentas(user, { ...baseRango, desde: inicioSemana, hasta: ahora }),
    ventasPorDia(user, { ...baseRango, desde: inicioMes, hasta: ahora }),
    topProductos(user, { ...baseRango, desde: inicioSemana, hasta: ahora, limite: 5 }),
    stockBajo(user, { sucursalId, formato: 'json' }),
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
